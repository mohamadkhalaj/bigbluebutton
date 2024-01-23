import { gql } from '@apollo/client';

export const PRESENTATION_SET_ZOOM = gql`
  mutation PresentationSetZoom($presentationId: String!, $pageId: String!, $pageNum: Int!, $xOffset: Float!, $yOffset: Float!, $widthRatio: Float!, $heightRatio: Float!) {
    presentationSetZoom(
      presentationId: $presentationId,
      pageId: $pageId,
      pageNum: $pageNum,
      xOffset: $xOffset,
      yOffset: $yOffset,
      widthRatio: $widthRatio,
      heightRatio: $heightRatio,
    )
  }
`;

export const PRESENTATION_SET_WRITERS = gql`
  mutation PresentationSetWriters($pageId: String!, $usersIds: [String]!) {
    presentationSetWriters(
      pageId: $pageId,
      usersIds: $usersIds,
    )
  }
`;

export const PRESENTATION_SET_PAGE = gql`
  mutation PresentationSetPage($presentationId: String!, $pageId: String!) {
    presentationSetPage(
      presentationId: $presentationId,
      pageId: $pageId,
    )
  }
`;

export const PRESENTATION_SET_DOWNLOADABLE = gql`
  mutation PresentationSetDownloadable(
    $presentationId: String!,
    $downloadable: Boolean!,
    $fileStateType: String!,) {
    presentationSetDownloadable(
      presentationId: $presentationId,
      downloadable: $downloadable,
      fileStateType: $fileStateType,
    )
  }
`;

export const PRESENTATION_SET_CURRENT = gql`
  mutation PresentationSetCurrent($presentationId: String!) {
    presentationSetCurrent(
      presentationId: $presentationId,
    )
  }
`;

export default {
  PRESENTATION_SET_ZOOM,
  PRESENTATION_SET_WRITERS,
  PRESENTATION_SET_PAGE,
  PRESENTATION_SET_DOWNLOADABLE,
  PRESENTATION_SET_CURRENT,
};
