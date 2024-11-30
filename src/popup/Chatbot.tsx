import {
  ConversationChain,
  ConversationalRetrievalQAChain,
} from "langchain/chains";
import { ChatOpenAI } from "langchain/chat_models/openai";

import { BufferMemory } from "langchain/memory";
import {
  ChatPromptTemplate,
  HumanMessagePromptTemplate,
  MessagesPlaceholder,
} from "langchain/prompts";
import {
  AIChatMessage,
  BaseChatMessage,
  HumanChatMessage,
} from "langchain/schema";
// import * as cheerio from 'cheerio';

import { AgentExecutor } from "langchain/agents";

import {
  FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import ReactMarkdown from "react-markdown";
import { ChatMode } from "../common/SettingsStoreProvider";
import { Select } from "../common/select/Select";
import { StorageKeys } from "../utils/constants";
import { clickElement, getCurrentPageContent, searchByDefaultProvider, typeText } from "../utils/getPageContent";
import { getAgent } from "../utils/llmChains";
import { useChatHistory } from "../utils/useChatHistory";
import { useSettingsStore } from "../utils/useSettingsStore";
import { useStoredState } from "../utils/useStoredState";
import { DynamicTool, Tool } from "langchain/tools";

function ChatMessageRow({ message }: { message: BaseChatMessage }) {
  return (
    <div
      style={{
        display: "flex",
        gap: "0.5rem",
        padding: "0.5rem 0",
      }}
    >
      <span>{message instanceof HumanChatMessage ? "You: " : "Miru: "}</span>
      <div>
        <ReactMarkdown children={message.text} />
      </div>
    </div>
  );
}

const ChatModeOptions = [
  {
    label: "Chat with GPT",
    value: "with-llm",
  },
  {
    label: "Chat with Miru",
    value: "with-agent",
  },
];

export default function Chatbot() {
  const { settings, setSettings } = useSettingsStore();

  const { openAIApiKey, chatMode = "with-llm" } = settings;
  const formRef = useRef<HTMLFormElement | null>(null);
  const outputPanelRef = useRef<HTMLDivElement | null>(null);
  const userInputRef = useRef<HTMLTextAreaElement | null>(null);
  const [, history, setHistory] = useChatHistory([]);
  const [, userInput, setUserInput] = useStoredState<string>({
    storageKey: StorageKeys.USER_INPUT,
    defaultValue: "",
    debounceSaveByMills: 1000,
  });
  const [userInputAwaitingResponse, setUserInputAwaitingResponse] = useState<
    string | undefined
  >();
  const [generating, setGenerating] = useState(false);
  const [responseStream, setResponseStream] = useState("");
  const [error, setError] = useState<string | undefined>();
  const abortControllerRef = useRef<AbortController | undefined>(undefined);

  useEffect(() => {
    outputPanelRef.current?.scrollTo(0, outputPanelRef.current.scrollHeight);
  }, [history, userInputAwaitingResponse, responseStream]);

  const chain = useMemo(() => {
    const llm = new ChatOpenAI({
      modelName: "gpt-3.5-turbo-instruct",
      // modelName: "gpt-3.5-turbo",
      openAIApiKey: openAIApiKey,
      temperature: 0,
      streaming: true,
      callbacks: [
        {
          handleLLMNewToken(token: string) {
            setResponseStream((streamingText) => {
              console.log(streamingText)
              return streamingText + token
            });
          },
          handleLLMEnd() {
            setResponseStream("");
          },
        },
      ],
    });


    if (chatMode === "with-agent") {
      const tools = [
        new DynamicTool({
          name: "read_page",
          description:
            "call this to get the content of active webpage. input should be empty",
          func: async () => {
            const pageContent = await getCurrentPageContent();
            console.log('pageContent', pageContent?.links);
            return JSON.stringify(pageContent);
          },
        }),
        new DynamicTool({
          name: "click_element",
          description:
            "call this to click any element of active webpage. input should be a css selector of that element in string format.",
          func: async (cssSelector) => {
            console.log('cssSelector', cssSelector);
            const pageContent = await clickElement(cssSelector);
            return JSON.stringify(pageContent)
          },
        }),
        new DynamicTool({
          name: "type_text",
          description: "call this to type text in any input element of active webpage. input should be an object of css selector of that element as attribute 'selector' and the text to be inserted as attribute 'text'.",
          func: async (payload) => {
            console.log(payload)
            const { selector, text} = JSON.parse(payload);
            const pageContent = await typeText(selector, text);
            return JSON.stringify(pageContent)
          },
        }),
        new DynamicTool({
          name: 'search',
          description: 'search via the default provider',
          func: async (query) => {
            const pageContent = await searchByDefaultProvider(query)
            return JSON.stringify(pageContent)
          }
        })
      ];
      return getAgent(llm, tools as Tool[]);
    }

    return new ConversationChain({
      memory: new BufferMemory({
        returnMessages: true,
        /**
         * inputKey is required if you are passing other non-input values when invoking chain.call
         */
        inputKey: "input",
        memoryKey: "history",
        chatHistory: {
          async getMessages() {
            return history;
          },
          async addUserMessage(message) {
            setHistory((history) => [
              ...history,
              new HumanChatMessage(message),
            ]);
          },
          async addAIChatMessage(message) {
            setHistory((history) => [...history, new AIChatMessage(message)]);
          },
          async clear() {
            setHistory([]);
          },
        },
      }),
      llm: llm,
      prompt: ChatPromptTemplate.fromPromptMessages([
        // new SystemChatMessage("Answer the following question:"),
        new MessagesPlaceholder("history"),
        HumanMessagePromptTemplate.fromTemplate("{input}"),
      ]),
    });
  }, [openAIApiKey, chatMode, history, setHistory]);

  const sendUserMessage = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();

      setGenerating(true);

      try {
        abortControllerRef.current = new AbortController();

        setUserInputAwaitingResponse(userInput);
        setUserInput("");
        if (chain instanceof ConversationChain) {
          await chain.call({
            input: userInput,
            signal: abortControllerRef.current?.signal,
          });

          // console.log({
          //   response,
          //   // history,
          //   outputKey: chain.outputKey,
          // });
        } else if (chain instanceof ConversationalRetrievalQAChain) {
          const response = await chain.call({
            question: userInput,
            chat_history: history,
            signal: abortControllerRef.current?.signal,
          });

          setHistory((history) => [
            ...history,
            new HumanChatMessage(userInput),
            new AIChatMessage(response.text),
          ]);
        } else if (chain instanceof AgentExecutor) {
          console.log('executing')
          const response = await chain.call({
            input: userInput,
            signal: abortControllerRef.current?.signal,
          });
          console.log('response', response);
          setHistory((history) => [
            ...history,
            new HumanChatMessage(userInput),
            new AIChatMessage(response.output),
          ]);
        }
      } catch (error) {
        console.error(error);
        if (!abortControllerRef.current?.signal.aborted) {
          setError(`${error}`);
        }
      } finally {
        setGenerating(false);
        setUserInputAwaitingResponse(undefined);
        abortControllerRef.current = undefined;
      }
    },
    [chain, history, setHistory, setUserInput, userInput]
  );

  const stopGenerating = useCallback(() => {
    abortControllerRef.current?.abort();
  }, []);

  const clearHistory = useCallback(async () => {
    setHistory([]);
  }, [setHistory]);

  useEffect(() => {
    if (!userInputRef.current) return;
    const textArea = userInputRef.current;
    textArea.style.height = "auto";
    textArea.style.height = `${textArea.scrollHeight}px`;
  }, [userInput]);

  return (
    <>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "1rem",
          alignItems: "stretch",
        }}
      >
        <Select
          options={ChatModeOptions}
          value={chatMode}
          onChange={(e) =>
            setSettings({
              ...settings,
              chatMode: e.target.value as ChatMode,
            })
          }
        />
        {(history.length > 0 ||
          userInputAwaitingResponse ||
          responseStream ||
          error) && (
            <div
              ref={outputPanelRef}
              style={{
                border: "1px solid lightgray",
                padding: "1rem",
                textAlign: "left",
                maxHeight: "20rem",
                overflowY: "auto",
              }}
            >
              {history.map((message, index) => {
                return <ChatMessageRow key={index} message={message} />;
              })}
              {userInputAwaitingResponse && (
                <ChatMessageRow
                  message={new HumanChatMessage(userInputAwaitingResponse)}
                />
              )}
              {responseStream && (
                <ChatMessageRow message={new AIChatMessage(responseStream)} />
              )}
              {error && (
                <ChatMessageRow message={new AIChatMessage(error)} />
              )}
            </div>
          )}

        <div style={{ display: "flex", justifyContent: "space-between" }}>
          {(history.length > 0 || userInputAwaitingResponse) && (
            <>
              {!generating && (
                <button
                  onClick={() => {
                    const lastHumanMessageIndex = history.findLastIndex(
                      (message) => message instanceof HumanChatMessage
                    );
                    if (lastHumanMessageIndex !== -1) {
                      setUserInput(history[lastHumanMessageIndex].text);
                      setHistory([...history.slice(0, lastHumanMessageIndex)]);

                      setTimeout(() => {
                        // Submit the form
                        formRef.current?.dispatchEvent(
                          new Event("submit", {
                            cancelable: true,
                            bubbles: true,
                          })
                        );
                      });
                    }
                  }}
                >
                  Regenerate Response
                </button>
              )}
              {generating && (
                <button onClick={stopGenerating}>Stop Generating</button>
              )}
              <button onClick={clearHistory} disabled={generating}>
                Clear History
              </button>
            </>
          )}
        </div>

        <form ref={formRef} onSubmit={sendUserMessage}>
          <textarea
            ref={userInputRef}
            id="message"
            placeholder="Send a message"
            style={{
              boxSizing: "border-box",
              padding: "0.5rem",
              width: "100%",
              resize: "vertical",
            }}
            value={userInput}
            onChange={(e) => {
              setUserInput(e.target.value);
            }}
            disabled={generating}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                // Don't insert a new line
                event.preventDefault();

                // Submit the form
                formRef.current?.dispatchEvent(
                  new Event("submit", { cancelable: true, bubbles: true })
                );
              }
            }}
            onResize={(event) => event.preventDefault()}
          />
        </form>
      </div>
    </>
  );
}
