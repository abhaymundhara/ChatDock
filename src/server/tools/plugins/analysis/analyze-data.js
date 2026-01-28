/**
 * analyze-data.js
 * Statistical analysis for arrays of numbers
 */

const definition = {
  type: "function",
  function: {
    name: "analyze_data",
    description:
      "Perform statistical analysis on numerical datasets. Calculates mean, median, mode, standard deviation, min, max, sum, count.",
    parameters: {
      type: "object",
      properties: {
        data: {
          type: "array",
          items: { type: "number" },
          description: "Array of numbers to analyze",
        },
        operations: {
          type: "array",
          items: { type: "string" },
          description:
            "Statistics to compute: mean, median, mode, stddev, min, max, sum, count (default: all)",
        },
      },
      required: ["data"],
    },
  },
};

function calculateMean(data) {
  return data.reduce((a, b) => a + b, 0) / data.length;
}

function calculateMedian(data) {
  const sorted = [...data].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

function calculateMode(data) {
  const frequency = {};
  let maxFreq = 0;
  let modes = [];

  data.forEach((val) => {
    frequency[val] = (frequency[val] || 0) + 1;
    if (frequency[val] > maxFreq) {
      maxFreq = frequency[val];
      modes = [val];
    } else if (frequency[val] === maxFreq && !modes.includes(val)) {
      modes.push(val);
    }
  });

  return modes.length === data.length ? null : modes;
}

function calculateStdDev(data) {
  const mean = calculateMean(data);
  const variance =
    data.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / data.length;
  return Math.sqrt(variance);
}

async function execute(args) {
  try {
    const { data, operations } = args;

    if (!Array.isArray(data) || data.length === 0) {
      return {
        success: false,
        error: "data must be a non-empty array",
      };
    }

    // Validate all elements are numbers
    if (!data.every((x) => typeof x === "number" && isFinite(x))) {
      return {
        success: false,
        error: "All data elements must be finite numbers",
      };
    }

    // Limit data size
    if (data.length > 100000) {
      return {
        success: false,
        error: "Dataset too large (max 100,000 elements)",
      };
    }

    const ops = operations || [
      "mean",
      "median",
      "mode",
      "stddev",
      "min",
      "max",
      "sum",
      "count",
    ];
    const results = { success: true };

    if (ops.includes("count")) results.count = data.length;
    if (ops.includes("sum")) results.sum = data.reduce((a, b) => a + b, 0);
    if (ops.includes("mean")) results.mean = calculateMean(data);
    if (ops.includes("median")) results.median = calculateMedian(data);
    if (ops.includes("mode")) results.mode = calculateMode(data);
    if (ops.includes("stddev"))
      results.standard_deviation = calculateStdDev(data);
    if (ops.includes("min")) results.min = Math.min(...data);
    if (ops.includes("max")) results.max = Math.max(...data);

    return results;
  } catch (error) {
    return {
      success: false,
      error: `Analysis failed: ${error.message}`,
    };
  }
}

module.exports = { definition, execute };
