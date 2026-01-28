/**
 * generate-chart.js
 * Create simple ASCII charts for data visualization
 */

const definition = {
  type: "function",
  function: {
    name: "generate_chart",
    description:
      "Generate ASCII charts for data visualization. Supports bar charts, line charts, and histograms.",
    parameters: {
      type: "object",
      properties: {
        data: {
          type: "array",
          items: { type: "number" },
          description: "Array of numbers to visualize",
        },
        labels: {
          type: "array",
          items: { type: "string" },
          description: "Optional labels for each data point",
        },
        chart_type: {
          type: "string",
          enum: ["bar", "line", "histogram"],
          description: "Type of chart (default: bar)",
        },
        title: {
          type: "string",
          description: "Chart title",
        },
        width: {
          type: "number",
          description: "Chart width in characters (default: 50, max: 100)",
        },
      },
      required: ["data"],
    },
  },
};

function generateBarChart(data, labels, width, title) {
  const maxValue = Math.max(...data);
  const scale = width / maxValue;

  let chart = "";
  if (title) chart += `${title}\n${"=".repeat(title.length)}\n\n`;

  data.forEach((value, index) => {
    const barLength = Math.round(value * scale);
    const bar = "█".repeat(barLength);
    const label =
      labels && labels[index]
        ? labels[index].padEnd(10)
        : `Item ${index + 1}`.padEnd(10);
    chart += `${label} | ${bar} ${value}\n`;
  });

  return chart;
}

function generateLineChart(data, labels, width, title) {
  const maxValue = Math.max(...data);
  const minValue = Math.min(...data);
  const range = maxValue - minValue;
  const height = 10;
  const scale = range > 0 ? (height - 1) / range : 0;

  let chart = "";
  if (title) chart += `${title}\n${"=".repeat(title.length)}\n\n`;

  // Create 2D grid
  const grid = Array(height)
    .fill(0)
    .map(() => Array(data.length).fill(" "));

  // Plot points
  data.forEach((value, x) => {
    const y = Math.round((maxValue - value) * scale);
    grid[y][x] = "•";
    // Connect with lines
    if (x > 0) {
      const prevValue = data[x - 1];
      const prevY = Math.round((maxValue - prevValue) * scale);
      const minY = Math.min(y, prevY);
      const maxY = Math.max(y, prevY);
      for (let i = minY; i <= maxY; i++) {
        if (grid[i][x - 1] === " " && grid[i][x] === " ") {
          grid[i][x - 1] = "·";
        }
      }
    }
  });

  // Render grid
  for (let y = 0; y < height; y++) {
    const yValue = (maxValue - y / scale).toFixed(1);
    chart += `${yValue.padStart(6)} | ${grid[y].join("")}\n`;
  }

  chart += `       ${"-".repeat(data.length)}\n`;
  if (labels && labels.length === data.length) {
    chart += `       ${labels.map((l) => l[0] || " ").join("")}\n`;
  }

  return chart;
}

function generateHistogram(data, labels, width, title) {
  // Create bins
  const bins = 10;
  const minValue = Math.min(...data);
  const maxValue = Math.max(...data);
  const binSize = (maxValue - minValue) / bins;

  const counts = Array(bins).fill(0);
  data.forEach((value) => {
    const binIndex = Math.min(
      Math.floor((value - minValue) / binSize),
      bins - 1,
    );
    counts[binIndex]++;
  });

  let chart = "";
  if (title) chart += `${title}\n${"=".repeat(title.length)}\n\n`;

  const maxCount = Math.max(...counts);
  const scale = width / maxCount;

  counts.forEach((count, index) => {
    const rangeStart = (minValue + index * binSize).toFixed(1);
    const rangeEnd = (minValue + (index + 1) * binSize).toFixed(1);
    const barLength = Math.round(count * scale);
    const bar = "█".repeat(barLength);
    chart += `${rangeStart}-${rangeEnd}`.padEnd(15) + `| ${bar} ${count}\n`;
  });

  return chart;
}

async function execute(args) {
  try {
    const { data, labels, chart_type = "bar", title, width = 50 } = args;

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
    if (data.length > 1000) {
      return {
        success: false,
        error: "Dataset too large (max 1,000 elements for charts)",
      };
    }

    const chartWidth = Math.min(Math.max(10, width), 100);
    let chart;

    switch (chart_type) {
      case "line":
        chart = generateLineChart(data, labels, chartWidth, title);
        break;
      case "histogram":
        chart = generateHistogram(data, labels, chartWidth, title);
        break;
      case "bar":
      default:
        chart = generateBarChart(data, labels, chartWidth, title);
        break;
    }

    return {
      success: true,
      chart,
      chart_type,
      data_points: data.length,
    };
  } catch (error) {
    return {
      success: false,
      error: `Chart generation failed: ${error.message}`,
    };
  }
}

module.exports = { definition, execute };
