/**
 * Все строковые "enum"-значения прикладного уровня.
 *
 * Prisma schema нарочно хранит их как `String` (см. `.cursor/rules/prisma-schema.mdc`),
 * поэтому единое место правды — здесь. Остальные пакеты должны импортировать
 * константы/тайпы из этого файла (`import { SignalStatus } from '@repo/shared-ts/enums'`).
 */

export const USER_ROLES = ['user', 'admin'] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const SIGNAL_STATUSES = [
  'PENDING',
  'OPEN',
  'ORDERS_PLACED',
  'CLOSED_WIN',
  'CLOSED_LOSS',
  'CLOSED_MIXED',
  'FAILED',
] as const;
export type SignalStatus = (typeof SIGNAL_STATUSES)[number];

export const SIGNAL_DIRECTIONS = ['BUY', 'SELL'] as const;
export type SignalDirection = (typeof SIGNAL_DIRECTIONS)[number];

export const ORDER_KINDS = ['ENTRY', 'DCA', 'TP', 'SL'] as const;
export type OrderKind = (typeof ORDER_KINDS)[number];

export const ORDER_STATUSES = [
  'NEW',
  'PARTIALLY_FILLED',
  'FILLED',
  'CANCELLED',
  'REJECTED',
  'FAILED',
  'EXPIRED',
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const USERBOT_SESSION_STATUSES = [
  'disconnected',
  'connecting',
  'connected',
  'qr_pending',
  'failed',
] as const;
export type UserbotSessionStatus = (typeof USERBOT_SESSION_STATUSES)[number];

export const USERBOT_COMMAND_TYPES = [
  'login_qr',
  'logout',
  'add_channel',
  'remove_channel',
  'reconnect',
  'sync_dialogs',
] as const;
export type UserbotCommandType = (typeof USERBOT_COMMAND_TYPES)[number];

export const USERBOT_COMMAND_STATUSES = ['queued', 'running', 'done', 'failed', 'expired'] as const;
export type UserbotCommandStatus = (typeof USERBOT_COMMAND_STATUSES)[number];

export const INGEST_STATUSES = [
  'pending_classify',
  'classifying',
  'classified',
  'ignored',
  'failed',
] as const;
export type IngestStatus = (typeof INGEST_STATUSES)[number];

export const CLASSIFICATIONS = ['signal', 'close', 'result', 'reentry', 'ignore'] as const;
export type Classification = (typeof CLASSIFICATIONS)[number];

export const SIGNAL_DRAFT_STATUSES = ['ready', 'fanned_out', 'rejected'] as const;
export type SignalDraftStatus = (typeof SIGNAL_DRAFT_STATUSES)[number];

export const CABINET_SIGNAL_STATUSES = [
  'queued',
  'executing',
  'executed',
  'skipped_by_filter',
  'failed',
] as const;
export type CabinetSignalStatus = (typeof CABINET_SIGNAL_STATUSES)[number];

export const LOG_LEVELS = ['debug', 'info', 'warn', 'error'] as const;
export type LogLevel = (typeof LOG_LEVELS)[number];

export const LOG_CATEGORIES = [
  'openrouter',
  'telegram',
  'bybit',
  'orders',
  'userbot',
  'classifier',
  'trader',
  'api',
  'system',
] as const;
export type LogCategory = (typeof LOG_CATEGORIES)[number];

export const SERVICE_NAMES = ['userbot', 'classifier', 'trader', 'api', 'web'] as const;
export type ServiceName = (typeof SERVICE_NAMES)[number];

export const BYBIT_NETWORKS = ['mainnet', 'testnet'] as const;
export type BybitNetwork = (typeof BYBIT_NETWORKS)[number];

/**
 * Имена pg-boss очередей. Единственный источник правды — не использовать строки
 * в других местах.
 */
export const QUEUE_NAMES = {
  classifyMessage: 'classify.message',
  executeSignal: 'execute.signal',
  pollCabinetPositions: 'poll.cabinet_positions',
  userbotCommand: 'userbot.command',
  recalcClosedPnl: 'recalc.closed_pnl',
  diagnosticsRun: 'diagnostics.run',
} as const;

export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];

/** Ключи CabinetSetting. */
export const CABINET_SETTING_KEYS = [
  'DEFAULT_ORDER_USD',
  'FORCED_LEVERAGE',
  'BUMP_TO_MIN_EXCHANGE_LOT',
  'TP_SL_STEP_POLICY',
  'ENTRY_FILL_STRATEGY',
  'DCA_ENABLED',
  'DEFAULT_LEVERAGE',
] as const;
export type CabinetSettingKey = (typeof CABINET_SETTING_KEYS)[number];

/** Ключи GlobalSetting. */
export const GLOBAL_SETTING_KEYS = [
  'PUBLIC_SIGNUP_ENABLED',
  'LLM_MODEL',
  'LLM_FALLBACK_MODEL',
  'MAINTENANCE_MODE',
] as const;
export type GlobalSettingKey = (typeof GLOBAL_SETTING_KEYS)[number];
