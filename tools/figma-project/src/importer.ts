import { configureFigmaImporter } from 'nevo-figma-import/config';
import { startFigmaImporter } from 'nevo-figma-import/runtime';

import { figmaProjectConfig } from './config';
import { projectResourceCatalogs } from './project/resourceCatalogs';

configureFigmaImporter(figmaProjectConfig.importer);
startFigmaImporter(projectResourceCatalogs);
