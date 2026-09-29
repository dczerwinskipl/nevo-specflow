import { figmaProjectConfig } from './config';

const config = figmaProjectConfig;
process.env.NEVO_CAPTURE_SOURCE_NAME = config.source.name;
process.env.NEVO_CAPTURE_SOURCE_REFERENCE = config.source.reference;
process.env.NEVO_CAPTURE_SOURCE_ROUTE = config.source.route;
process.env.NEVO_CAPTURE_HOST = config.export.host;
process.env.NEVO_CAPTURE_PORT = String(config.export.port);
process.env.NEVO_CAPTURE_WIDTH = String(config.export.captureViewport.width);
process.env.NEVO_CAPTURE_HEIGHT = String(config.export.captureViewport.height);
process.env.NEVO_CAPTURE_DEVICE_SCALE_FACTOR = String(
  config.export.captureViewport.deviceScaleFactor,
);
process.env.NEVO_DESIGN_IR_OUT = config.export.designOutput;
process.env.NEVO_SCREENS_IR_OUT = config.export.screensOutput;

await import('nevo-figma-export/extract');
