import {
  GetPageContentRequest,
  GetPageContentResponse,
} from "../content-script";

export async function getCurrentPageContent() {
  const [tab] = await chrome.tabs.query({
    active: true,
    currentWindow: true,
  });

  if (!tab.id) return;

  try {

    return chrome.tabs.sendMessage<
      GetPageContentRequest,
      GetPageContentResponse
    >(tab.id, {
      action: "getPageContent",
    });
  } catch (error) {
    console.error(error);
    throw new Error("Unable to get page content");
  }
}

function simulateClick(selector: string) {
  const element = document.querySelector(selector);

  if (element) {
    // Create a new MouseEvent object
    const mouseClickEvents = new MouseEvent('click', {
      'view': window,
      'bubbles': true,
      'cancelable': true
    });

    // Dispatch the event to the element
    element.dispatchEvent(mouseClickEvents);
  } else {
    console.error('Element not found for selector:', selector);
  }
}


export async function clickElement(cssSelector: string) {
  const [tab] = await chrome.tabs.query({
    active: true,
    currentWindow: true,
  });

  if (!tab.id) return '';

  try {
    await chrome.scripting.executeScript({
      target : {tabId : tab.id},
      func : simulateClick,
      args : [ cssSelector ],
    });
    return chrome.tabs.sendMessage<
      GetPageContentRequest,
      GetPageContentResponse
    >(tab.id, {
      action: "getPageContent",
    })
  } catch (error) {
    console.error(error);
    throw new Error("Unable to get page content");
  }
}

function simulateTyping(cssSelector: string, text: string) {
  const keyboardEventInit = {bubbles:false, cancelable:false, composed:false, key:'', code:'', location:0};
  const element = document.querySelector(cssSelector);

  if (element instanceof HTMLInputElement) {

    for (const elem of text) {
      console.log(elem)
      element.dispatchEvent(new KeyboardEvent("keydown", keyboardEventInit));
      element.value += elem;
      element.dispatchEvent(new KeyboardEvent("keyup", keyboardEventInit));
      element.dispatchEvent(new Event('change', {bubbles: true}));
    }

  }

}

export async function typeText(cssSelector: string, text: string) {
  const [tab] = await chrome.tabs.query({
    active: true,
    currentWindow: true,
  });

  if (!tab.id) return '';

  try {
    console.log('typeText', cssSelector)
    await chrome.scripting.executeScript({
      target : {tabId : tab.id},
      func : simulateTyping,
      args : [cssSelector.replace('\\', ''), text],
    });
    return await chrome.tabs.sendMessage<
      GetPageContentRequest,
      string
    >(tab.id, {
      action: "getPageContent"
    });
  } catch (error) {
    console.error(error);
    return JSON.stringify(error);
  }
}

export async function searchByDefaultProvider(text: string) {
  const [tab] = await chrome.tabs.query({
    active: true,
    currentWindow: true,
  });

  if (!tab.id) return '';

  try {
    await chrome.search.query({
      text: text,
      tabId: tab.id
    });
    return await chrome.tabs.sendMessage<
      GetPageContentRequest,
      string
    >(tab.id, {
      action: "getPageContent"
    });
  } catch (error) {
    console.error(error);
    return JSON.stringify(error);
  }
}