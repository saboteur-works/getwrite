/**
 * @module resource
 *
 * Stable resource API facade.
 *
 * This module is responsible for:
 * - Re-exporting stable factory and validation APIs from `resource-factory`.
 * - Re-exporting stable persistence APIs from `resource-persistence`.
 * - Re-exporting template inspection/validation helpers from `template-service`.
 */
import {
    createAudioResource,
    createImageResource,
    createTextResource,
    validateResource,
} from "./resource-factory";
export {
    createAudioResource,
    createFolderResource,
    createImageResource,
    createResourceOfType,
    createTextResource,
    validateResource,
} from "./resource-factory";
export type { CreateResourceOpts } from "./resource-factory";
export { getLocalResources, writeResourceToFile } from "./resource-persistence";
export {
    inspectTemplate,
    validateTemplate,
    type TemplateInspection,
    type TemplateValidationResult,
} from "./template-service";

/**
 * Convenience default export of core resource factory/validation helpers.
 */
export default {
    createTextResource,
    createImageResource,
    createAudioResource,
    validateResource,
};
