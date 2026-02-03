/**
 * Weather Skill
 * Get weather information using wttr.in (no API key needed)
 */

// Node 18+ global fetch used

// Tool definitions
const tools = [
  {
    type: "function",
    function: {
      name: "get_weather",
      description: "Get current weather for a location",
      parameters: {
        type: "object",
        properties: {
          location: {
            type: "string",
            description: "City name, airport code, or coordinates (e.g., 'New York', 'JFK', '40.7,-74')",
          },
          units: {
            type: "string",
            enum: ["metric", "imperial"],
            description: "Temperature units (metric=Celsius, imperial=Fahrenheit). Default: metric",
          },
        },
        required: ["location"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_forecast",
      description: "Get weather forecast for a location (3-day)",
      parameters: {
        type: "object",
        properties: {
          location: {
            type: "string",
            description: "City name, airport code, or coordinates",
          },
          units: {
            type: "string",
            enum: ["metric", "imperial"],
            description: "Temperature units. Default: metric",
          },
        },
        required: ["location"],
      },
    },
  },
];

// Tool executors
const executors = {
  async get_weather({ location, units = "metric" }) {
    try {
      // Use wttr.in - free, no API key needed
      const unitParam = units === "imperial" ? "u" : "m";
      const url = `https://wttr.in/${encodeURIComponent(location)}?format=j1&${unitParam}`;

      const response = await fetch(url);
      if (!response.ok) {
        return { success: false, error: `Failed to fetch weather: ${response.statusText}` };
      }

      const data = await response.json();
      const current = data.current_condition[0];
      const area = data.nearest_area[0];

      const tempUnit = units === "imperial" ? "°F" : "°C";
      const speedUnit = units === "imperial" ? "mph" : "km/h";

      return {
        success: true,
        location: `${area.areaName[0].value}, ${area.country[0].value}`,
        current: {
          temperature: `${current.temp_C}°C / ${current.temp_F}°F`,
          feels_like: `${current.FeelsLikeC}°C / ${current.FeelsLikeF}°F`,
          condition: current.weatherDesc[0].value,
          humidity: `${current.humidity}%`,
          wind: `${current.windspeedKmph} km/h (${current.windspeedMiles} mph) ${current.winddir16Point}`,
          precipitation: `${current.precipMM} mm`,
          visibility: `${current.visibility} km`,
          uv_index: current.uvIndex,
        },
        observation_time: current.observation_time,
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },

  async get_forecast({ location, units = "metric" }) {
    try {
      const unitParam = units === "imperial" ? "u" : "m";
      const url = `https://wttr.in/${encodeURIComponent(location)}?format=j1&${unitParam}`;

      const response = await fetch(url);
      if (!response.ok) {
        return { success: false, error: `Failed to fetch forecast: ${response.statusText}` };
      }

      const data = await response.json();
      const area = data.nearest_area[0];
      const forecast = data.weather.slice(0, 3).map((day) => ({
        date: day.date,
        max_temp: `${day.maxtempC}°C / ${day.maxtempF}°F`,
        min_temp: `${day.mintempC}°C / ${day.mintempF}°F`,
        avg_temp: `${day.avgtempC}°C / ${day.avgtempF}°F`,
        condition: day.hourly[4].weatherDesc[0].value, // Midday condition
        total_snow: `${day.totalSnow_cm} cm`,
        sun_hour: day.sunHour,
        uv_index: day.uvIndex,
      }));

      return {
        success: true,
        location: `${area.areaName[0].value}, ${area.country[0].value}`,
        forecast,
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },
};

// Plugin metadata
module.exports = {
  name: "Weather",
  description: "Get weather information and forecasts",
  version: "1.0.0",
  category: "weather",
  tools,
  executors,
  metadata: {
    tags: ["weather", "forecast", "climate"],
    attribution: "Uses wttr.in API",
  },
};
