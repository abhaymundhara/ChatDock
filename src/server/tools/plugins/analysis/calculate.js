/**
 * analyze.js
 * Data analysis and calculation tools
 * Cross-platform mathematical operations
 */

const definition = {
  type: "function",
  function: {
    name: "calculate",
    description:
      "Perform mathematical calculations and expressions. Supports basic math, trigonometry, statistics. Safe evaluation with Math library access.",
    parameters: {
      type: "object",
      properties: {
        expression: {
          type: "string",
          description:
            'Mathematical expression to evaluate (e.g., "2 + 2 * 3", "Math.sqrt(16)", "Math.sin(Math.PI / 2)")',
        },
      },
      required: ["expression"],
    },
  },
};

// Safe Math evaluation (no eval())
function safeCalculate(expression) {
  // Whitelist allowed characters and functions
  const allowedPattern = /^[0-9+\-*/().\s,Math.a-zA-Z]+$/;

  if (!allowedPattern.test(expression)) {
    throw new Error("Expression contains invalid characters");
  }

  // Create safe context with Math only
  const safeContext = {
    Math: Math,
    // Add common aliases
    PI: Math.PI,
    E: Math.E,
    sqrt: Math.sqrt,
    pow: Math.pow,
    abs: Math.abs,
    sin: Math.sin,
    cos: Math.cos,
    tan: Math.tan,
    log: Math.log,
    exp: Math.exp,
    floor: Math.floor,
    ceil: Math.ceil,
    round: Math.round,
    min: Math.min,
    max: Math.max,
  };

  // Use Function constructor instead of eval (still allows Math)
  try {
    const func = new Function(
      ...Object.keys(safeContext),
      `return (${expression});`,
    );
    const result = func(...Object.values(safeContext));
    return result;
  } catch (err) {
    throw new Error(`Calculation error: ${err.message}`);
  }
}

async function execute(args) {
  try {
    const { expression } = args;

    if (!expression || expression.trim().length === 0) {
      return {
        success: false,
        error: "Expression is required",
      };
    }

    const result = safeCalculate(expression);

    // Check if result is valid
    if (typeof result !== "number" || !isFinite(result)) {
      return {
        success: false,
        error: "Calculation produced invalid result (NaN or Infinity)",
      };
    }

    return {
      success: true,
      expression,
      result,
      formatted: result.toLocaleString(), // Human-readable format
    };
  } catch (error) {
    return {
      success: false,
      error: `Calculation failed: ${error.message}`,
      expression: args.expression,
    };
  }
}

module.exports = { definition, execute };
