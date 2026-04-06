/**
 * Deck calculator uses one set of event_tasks (timber names) for both variants.
 * Composite sub-calculator differs only in the decking *boards* material row.
 */

export type DeckVariant = 'timber' | 'composite';

export const TIMBER_DECK_TASK_KEYS = {
  diggingHoles: 'digging holes for posts',
  settingPosts: 'setting up posts',
  boardCuts: 'decking boards cuts',
  cuttingJoists: 'cutting decking joists',
  fixingFrame: 'fixing decking frame',
  fixingBoards: 'fixing decking boards',
  frameBoardCuts: 'decking frame boards cuts',
} as const;

export const TIMBER_DECK_TASK_NAMES = Object.values(TIMBER_DECK_TASK_KEYS);
