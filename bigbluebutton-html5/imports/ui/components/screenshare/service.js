import { makeVar, useReactiveVar } from '@apollo/client';
import KurentoBridge from '/imports/api/screenshare/client/bridge';
import BridgeService from '/imports/api/screenshare/client/bridge/service';
import logger from '/imports/startup/client/logger';
import AudioService from '/imports/ui/components/audio/service';
import MediaStreamUtils from '/imports/utils/media-stream-utils';
import ConnectionStatusService from '/imports/ui/components/connection-status/service';
import browserInfo from '/imports/utils/browserInfo';
import createUseSubscription from '/imports/ui/core/hooks/createUseSubscription';
import { SCREENSHARE_SUBSCRIPTION } from './queries';

const SCREENSHARE_MEDIA_ELEMENT_NAME = 'screenshareVideo';

const DEFAULT_SCREENSHARE_STATS_TYPES = [
  'outbound-rtp',
  'inbound-rtp',
];

const CONTENT_TYPE_CAMERA = 'camera';
const CONTENT_TYPE_SCREENSHARE = 'screenshare';

const isSharingVar = makeVar(false);
const sharingContentTypeVar = makeVar(false);
const cameraAsContentDeviceIdTypeVar = makeVar('');

const useScreenshare = createUseSubscription(SCREENSHARE_SUBSCRIPTION, {}, true);

const useIsSharing = () => useReactiveVar(isSharingVar);
const useSharingContentType = () => useReactiveVar(sharingContentTypeVar);
const useCameraAsContentDeviceIdType = () => useReactiveVar(cameraAsContentDeviceIdTypeVar);

const isSharing = () => isSharingVar();

const setIsSharing = (sharing) => {
  if (isSharing() !== sharing) {
    isSharingVar(sharing);
  }
};

const getSharingContentType = () => sharingContentTypeVar();

const setSharingContentType = (contentType) => {
  if (getSharingContentType() !== contentType) {
    sharingContentTypeVar(contentType);
  }
};

const getCameraAsContentDeviceId = () => cameraAsContentDeviceIdTypeVar();

const setCameraAsContentDeviceId = (deviceId) => {
  if (getCameraAsContentDeviceId() !== deviceId) {
    cameraAsContentDeviceIdTypeVar(deviceId);
  }
};

const _trackStreamTermination = (stream, handler) => {
  if (typeof stream !== 'object' || typeof handler !== 'function') {
    throw new TypeError('Invalid trackStreamTermination arguments');
  }
  let _handler = handler;

  // Dirty, but effective way of checking whether the browser supports the 'inactive'
  // event. If the oninactive interface is null, it can be overridden === supported.
  // If undefined, it's not; so we fallback to the track 'ended' event.
  // The track ended listener should probably be reviewed once we create
  // thin wrapper classes for MediaStreamTracks as well, because we'll want a single
  // media stream holding multiple tracks in the future
  if (stream.oninactive !== undefined) {
    if (typeof stream.oninactive === 'function') {
      const oldHandler = stream.oninactive;
      _handler = () => {
        oldHandler();
        handler();
      };
    }
    stream.addEventListener('inactive', handler, { once: true });
  } else {
    const track = MediaStreamUtils.getVideoTracks(stream)[0];
    if (track) {
      track.addEventListener('ended', handler, { once: true });
      if (typeof track.onended === 'function') {
        const oldHandler = track.onended;
        _handler = () => {
          oldHandler();
          handler();
        };
      }
      track.onended = _handler;
    }
  }
};

const _isStreamActive = (stream) => {
  const tracksAreActive = !stream.getTracks().some((track) => track.readyState === 'ended');

  return tracksAreActive && stream.active;
};

const _handleStreamTermination = () => {
  screenshareHasEnded();
};

const useIsScreenGloballyBroadcasting = () => {
  const { data } = useScreenshare();
  return Boolean(
    data
    && data[0]
    && data[0].contentType === CONTENT_TYPE_SCREENSHARE
    && data[0].stream,
  );
};

const useIsCameraAsContentGloballyBroadcasting = () => {
  const { data } = useScreenshare();

  return Boolean(data && data[0] && data[0].contentType === CONTENT_TYPE_CAMERA && data[0].stream);
};

const useIsScreenBroadcasting = () => {
  const active = useIsSharing();
  const sharingContentType = useSharingContentType();
  const screenIsShared = useIsScreenGloballyBroadcasting();
  const sharing = active && sharingContentType === CONTENT_TYPE_SCREENSHARE;

  return sharing || screenIsShared;
};

const useIsCameraAsContentBroadcasting = () => {
  const active = useIsSharing();
  const sharingContentType = useSharingContentType();
  const sharing = active && sharingContentType === CONTENT_TYPE_CAMERA;
  const cameraAsContentIsShared = useIsCameraAsContentGloballyBroadcasting();

  return sharing || cameraAsContentIsShared;
};

const useScreenshareHasAudio = () => {
  const { data } = useScreenshare();

  return Boolean(data && data[0] && data[0].hasAudio);
};

const useBroadcastContentType = () => {
  const { data } = useScreenshare();

  if (!data || !data[0]) {
    // defaults to contentType: "camera"
    return CONTENT_TYPE_CAMERA;
  }

  return data[0].contentType;
};

const screenshareHasEnded = () => {
  if (isSharingVar()) {
    setIsSharing(false);
  }
  if (getSharingContentType() === CONTENT_TYPE_CAMERA) {
    setCameraAsContentDeviceId('');
  }

  KurentoBridge.stop();
};

const getMediaElement = () => document.getElementById(SCREENSHARE_MEDIA_ELEMENT_NAME);

const getMediaElementDimensions = () => {
  const element = getMediaElement();
  return {
    width: element?.videoWidth ?? 0,
    height: element?.videoHeight ?? 0,
  };
};

const setVolume = (volume) => {
  KurentoBridge.setVolume(volume);
};

const getVolume = () => KurentoBridge.getVolume();

const useShouldEnableVolumeControl = () => {
  const SCREENSHARE_CONFIG = window.meetingClientSettings.public.kurento.screenshare;
  const VOLUME_CONTROL_ENABLED = SCREENSHARE_CONFIG.enableVolumeControl;
  const hasAudio = useScreenshareHasAudio();

  return VOLUME_CONTROL_ENABLED && hasAudio;
};

const attachLocalPreviewStream = (mediaElement) => {
  const { isTabletApp } = browserInfo;
  if (isTabletApp) {
    // We don't show preview for mobile app, as the stream is only available in native code
    return;
  }
  const stream = KurentoBridge.gdmStream;
  if (stream && mediaElement) {
    // Always muted, presenter preview.
    BridgeService.screenshareLoadAndPlayMediaStream(stream, mediaElement, true);
  }
};

const setOutputDeviceId = (outputDeviceId) => {
  const screenShareElement = document.getElementById(SCREENSHARE_MEDIA_ELEMENT_NAME);
  const sinkIdSupported = screenShareElement && typeof screenShareElement.setSinkId === 'function';
  const srcStream = screenShareElement?.srcObject;

  if (typeof outputDeviceId === 'string'
    && sinkIdSupported
    && screenShareElement.sinkId !== outputDeviceId
    && srcStream
    && srcStream.getAudioTracks().length > 0) {
    try {
      screenShareElement.setSinkId(outputDeviceId);
      logger.debug({
        logCode: 'screenshare_output_device_change',
        extraInfo: {
          newDeviceId: outputDeviceId,
        },
      }, `Screenshare output device changed: to ${outputDeviceId || 'default'}`);
    } catch (error) {
      logger.error({
        logCode: 'screenshare_output_device_change_failure',
        extraInfo: {
          errorName: error.name,
          errorMessage: error.message,
          newDeviceId: outputDeviceId,
        },
      }, `Error changing screenshare output device - {${error.name}: ${error.message}}`);
    }
  }
};

const screenshareHasStarted = (hasAudio, isPresenter, options = {}) => {
  // Presenter's screen preview is local, so skip
  if (!isPresenter) {
    viewScreenshare({ outputDeviceId: options.outputDeviceId }, hasAudio);
  }
};

const shareScreen = async (
  isCameraAsContentBroadcasting,
  stopWatching,
  isPresenter,
  onFail,
  options = {},
) => {
  if (isCameraAsContentBroadcasting) {
    screenshareHasEnded();
  }

  try {
    let stream;
    let contentType = CONTENT_TYPE_SCREENSHARE;
    if (options.stream == null) {
      stream = await BridgeService.getScreenStream();
    } else {
      contentType = CONTENT_TYPE_CAMERA;
      stream = options.stream;
    }
    _trackStreamTermination(stream, _handleStreamTermination);

    if (!isPresenter) {
      MediaStreamUtils.stopMediaStreamTracks(stream);
      return;
    }

    await KurentoBridge.share(stream, onFail, contentType);

    // Stream might have been disabled in the meantime. I love badly designed
    // async components like this screen sharing bridge :) - prlanzarin 09 May 22
    if (!_isStreamActive(stream)) {
      _handleStreamTermination();
      return;
    }

    // stop external video share if running
    stopWatching();

    setSharingContentType(contentType);
    setIsSharing(true);
  } catch (error) {
    onFail(error);
  }
};

const viewScreenshare = (options = {}, hasAudio) => {
  KurentoBridge.view({ hasAudio, outputDeviceId: options.outputDeviceId })
    .catch((error) => {
      logger.error({
        logCode: 'screenshare_view_failed',
        extraInfo: {
          errorName: error.name,
          errorMessage: error.message,
        },
      }, 'Screenshare viewer failure');
    });
};

const screenShareEndAlert = () => AudioService
  .playAlertSound(`${window.meetingClientSettings.public.app.cdn
    + window.meetingClientSettings.public.app.basename
    + window.meetingClientSettings.public.app.instanceId}`
    + '/resources/sounds/ScreenshareOff.mp3');

/**
   * Get stats about all active screenshare peers.
   *
   * For more information see:
   *  - https://developer.mozilla.org/en-US/docs/Web/API/RTCPeerConnection/getStats
   *  - https://developer.mozilla.org/en-US/docs/Web/API/RTCStatsReport

   * @param {Array[String]} statsType - An array containing valid RTCStatsType
   *                                    values to include in the return object
   *
   * @returns {Object} The information about each active screen sharing peer.
   *          The returned format follows the format returned by video's service
   *          getStats, which considers more than one peer connection to be returned.
   *          The format is given by:
   *          {
   *            peerIdString: RTCStatsReport
   *          }
   */
const getStats = async (statsTypes = DEFAULT_SCREENSHARE_STATS_TYPES) => {
  const screenshareStats = {};
  const peer = KurentoBridge.getPeerConnection();

  if (!peer) return null;

  const peerStats = await peer.getStats();

  peerStats.forEach((stat) => {
    if (statsTypes.includes(stat.type)) {
      screenshareStats[stat.type] = stat;
    }
  });

  return { screenshareStats };
};

// This method may throw errors
const isMediaFlowing = (previousStats, currentStats) => {
  const bpsData = ConnectionStatusService.calculateBitsPerSecond(
    currentStats?.screenshareStats,
    previousStats?.screenshareStats,
  );
  const bpsDataAggr = Object.values(bpsData)
    .reduce((sum, partialBpsData = 0) => sum + parseFloat(partialBpsData), 0);

  return bpsDataAggr > 0;
};

export {
  SCREENSHARE_MEDIA_ELEMENT_NAME,
  isMediaFlowing,
  screenshareHasEnded,
  screenshareHasStarted,
  shareScreen,
  screenShareEndAlert,
  isSharing,
  setIsSharing,
  setSharingContentType,
  getSharingContentType,
  getMediaElement,
  getMediaElementDimensions,
  attachLocalPreviewStream,
  getStats,
  setVolume,
  getVolume,
  setCameraAsContentDeviceId,
  getCameraAsContentDeviceId,
  setOutputDeviceId,
  useCameraAsContentDeviceIdType,
  useIsSharing,
  useSharingContentType,
  useIsScreenGloballyBroadcasting,
  useIsCameraAsContentGloballyBroadcasting,
  useShouldEnableVolumeControl,
  useIsScreenBroadcasting,
  useIsCameraAsContentBroadcasting,
  useScreenshareHasAudio,
  useBroadcastContentType,
};
