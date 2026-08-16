import { Config } from "@remotion/cli/config";

Config.setVideoImageFormat("jpeg");
Config.setEntryPoint("./src/index.ts");
// The captures are 1170x2532 phone frames scaled down inside a 1080p canvas,
// so quality here is what keeps the interface text readable on a projector.
Config.setJpegQuality(95);
