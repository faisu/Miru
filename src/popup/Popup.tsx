import styles from "./Popup.module.css";
import Chatbot from "./Chatbot";
import Options from "../options/Options";
import { useSettingsStore } from "../utils/useSettingsStore";

function Popup() {
  const { loading, settings } = useSettingsStore();


  if (loading || !settings.openAIApiKey) {
    return <Options />;
  }

  return (
    <>
      <main className={styles.container}>
        <div className={styles.tabContent}>
        <Chatbot />
        </div>
        
      </main>
      <footer style={{ marginTop: "1rem", fontStyle: "italic", opacity: 0.75 }}>
        Powered by {" "}<a href="https://bridgeit.in/">BridgeIT</a> and{" "}
        <a href="https://js.langchain.com/docs/"> LangChain</a>
      </footer>
    </>
  );
}

export default Popup;
