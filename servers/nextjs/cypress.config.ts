import { defineConfig } from "cypress";

export default defineConfig({
  allowCypressEnv: false,
  screenshotsFolder: "../../.nimi/local/cypress/screenshots",
  videosFolder: "../../.nimi/local/cypress/videos",
  component: {
    devServer: {
      framework: "next",
      bundler: "webpack",
    },
  },
});
