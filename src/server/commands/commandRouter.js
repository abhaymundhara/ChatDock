const { handleNotesCommands } = require("./notesCommands");
const { handleDocsCommands } = require("./docsCommands");

async function handleCommand(userMsg, state) {
  const normalizedMsg = userMsg.trim().toLowerCase();

  // 1. Exit/Reset Commands
  const exitCommands = ["no thanks", "no thank you", "nothing else", "that's all", "stop", "exit"];
  if (exitCommands.includes(normalizedMsg)) {
    return {
      handled: true,
      response: "Understood. I've reset our conversation context. Let me know if you need anything else!",
      newState: {
        ...state,
        canSaveLastAnswer: false,
        lastAnswerContent: "",
        awaitingConfirmation: false,
        pendingIntent: "",
        history: []
      }
    };
  }

  // 2. Try Notes Commands
  let result = handleNotesCommands(userMsg, state);
  if (result.handled) return result;

  // 3. Try Docs Commands
  result = handleDocsCommands(userMsg, state);
  if (result.handled) return result;

  // No command matched
  return { handled: false, newState: state };
}

module.exports = { handleCommand };
