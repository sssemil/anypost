type ScreenShareState = {
  readonly sharing: boolean;
  readonly previousCameraEnabled: boolean | null;
};

export const createScreenShareState = (): ScreenShareState => ({
  sharing: false,
  previousCameraEnabled: null,
});

export const startScreenShare = (
  state: ScreenShareState,
  cameraWasEnabled: boolean,
): ScreenShareState => {
  if (state.sharing) return state;
  return { sharing: true, previousCameraEnabled: cameraWasEnabled };
};

export const stopScreenShare = (
  state: ScreenShareState,
): ScreenShareState => {
  if (!state.sharing) return state;
  return { sharing: false, previousCameraEnabled: null };
};

export const isSharing = (state: ScreenShareState): boolean => state.sharing;

export const getPreviousCameraEnabled = (
  state: ScreenShareState,
): boolean | null => state.previousCameraEnabled;
