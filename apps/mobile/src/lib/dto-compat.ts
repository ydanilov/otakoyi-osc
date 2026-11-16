/**
 * Type-level sensor (ADR-020): the design system (`@osc/ui`) declares its own copies of the
 * bridge's media and prompt DTOs so it builds without `@osc/protocol`. `pnpm typecheck` fails here
 * if the two drift apart.
 */
import type { ImageAssetDto, PromptPresetDto } from "@osc/protocol";
import type {
  ImageAssetDto as DsImageAssetDto,
  PromptPresetDto as DsPromptPresetDto,
} from "@osc/ui";

type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
const assertTrue = <T extends true>() => undefined as unknown as T;

export const imageAssetDtoInSync = assertTrue<Same<ImageAssetDto, DsImageAssetDto>>();
export const promptPresetDtoInSync = assertTrue<Same<PromptPresetDto, DsPromptPresetDto>>();
