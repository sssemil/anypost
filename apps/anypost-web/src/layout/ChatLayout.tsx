import type { JSX } from "solid-js";

type ChatLayoutProps = {
  readonly header: JSX.Element;
  readonly sidebar: JSX.Element;
  readonly messageList: JSX.Element;
  readonly messageInput: JSX.Element;
  readonly bottomPanels: JSX.Element;
};

export const ChatLayout = (props: ChatLayoutProps) => {
  return (
    <div style={{
      display: "flex",
      "flex-direction": "column",
      height: "100vh",
      "font-family": "system-ui",
    }}>
      {props.header}

      <div style={{
        display: "flex",
        flex: 1,
        "min-height": 0,
      }}>
        {props.sidebar}

        <div style={{
          flex: 1,
          display: "flex",
          "flex-direction": "column",
          "min-width": 0,
        }}>
          <div style={{ flex: 1, padding: "12px", "min-height": 0 }}>
            {props.messageList}
          </div>

          <div style={{ padding: "0 12px 12px" }}>
            {props.messageInput}
          </div>
        </div>
      </div>

      <div style={{
        "max-height": "40vh",
        "overflow-y": "auto",
        padding: "0 12px 12px",
      }}>
        {props.bottomPanels}
      </div>
    </div>
  );
};
