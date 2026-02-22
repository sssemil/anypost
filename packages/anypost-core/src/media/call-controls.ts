type CallState = {
  readonly inCall: boolean;
  readonly muted: boolean;
  readonly cameraEnabled: boolean;
  readonly screenSharing: boolean;
};

type CallControlsState = {
  readonly canToggleMute: boolean;
  readonly canToggleCamera: boolean;
  readonly canToggleScreenShare: boolean;
  readonly canHangUp: boolean;
  readonly isMuted: boolean;
  readonly isCameraEnabled: boolean;
  readonly isScreenSharing: boolean;
};

export const getCallControlsState = (state: CallState): CallControlsState => ({
  canToggleMute: state.inCall,
  canToggleCamera: state.inCall,
  canToggleScreenShare: state.inCall,
  canHangUp: state.inCall,
  isMuted: state.muted,
  isCameraEnabled: state.cameraEnabled,
  isScreenSharing: state.screenSharing,
});
