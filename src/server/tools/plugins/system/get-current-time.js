const definition = {
  type: "function",
  function: {
    name: "get_current_time",
    description: "Get the current date and time",
    parameters: {
      type: "object",
      properties: {},
      required: [],
      additionalProperties: false,
    },
  },
};

async function execute() {
  const now = new Date();
  return {
    success: true,
    timestamp: now.toISOString(),
    formatted: now.toLocaleString(),
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  };
}

module.exports = { definition, execute };
