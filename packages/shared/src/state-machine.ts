import { UserRole } from './index';

export const ORDER_STATUSES = [
  'CREATED',
  'PAYMENT_PENDING',
  'PAYMENT_FAILED',
  'PLACED',
  'ACCEPTED',
  'PREPARING',
  'READY',
  'PICKED_UP',
  'DELIVERED',
  'CANCELLED',
  'REJECTED_BY_RESTAURANT',
  'EXPIRED',
  'FAILED_DELIVERY',
] as const;

export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const TERMINAL_ORDER_STATUSES: readonly OrderStatus[] = [
  'PAYMENT_FAILED',
  'REJECTED_BY_RESTAURANT',
  'EXPIRED',
  'CANCELLED',
  'DELIVERED',
  'FAILED_DELIVERY',
] as const;

export type ActorRole = UserRole | 'SYSTEM';

export interface TransitionPayload {
  prepTimeMinutes?: number;
  rejectionReason?: string;
  cancellationReason?: string;
  failureReason?: string;
  note?: string;
  [key: string]: any;
}

export interface TransitionContext {
  actorRole: ActorRole;
  actorId?: string;
  payload?: TransitionPayload;
}

export interface TransitionSuccess {
  ok: true;
  fromStatus: OrderStatus;
  toStatus: OrderStatus;
  actorRole: ActorRole;
  actorId?: string;
  payload?: TransitionPayload;
  timestamp: string;
}

export interface TransitionFailure {
  ok: false;
  fromStatus: OrderStatus;
  toStatus: OrderStatus;
  error: string;
  code:
    | 'TERMINAL_STATE'
    | 'ILLEGAL_TRANSITION'
    | 'UNAUTHORIZED_ACTOR'
    | 'MISSING_PAYLOAD';
}

export type TransitionResult = TransitionSuccess | TransitionFailure;

/**
 * Transition rules map: currentStatus -> targetStatus -> allowed roles
 */
const TRANSITION_RULES: Record<OrderStatus, Partial<Record<OrderStatus, readonly ActorRole[]>>> = {
  CREATED: {
    PAYMENT_PENDING: ['CUSTOMER', 'SYSTEM', 'ADMIN'],
    PLACED: ['CUSTOMER', 'SYSTEM', 'ADMIN'], // Direct placement for COD
    CANCELLED: ['CUSTOMER', 'ADMIN', 'SYSTEM'],
  },
  PAYMENT_PENDING: {
    PLACED: ['SYSTEM', 'ADMIN'], // Inbound payment captured
    PAYMENT_FAILED: ['SYSTEM', 'ADMIN'],
    CANCELLED: ['CUSTOMER', 'SYSTEM', 'ADMIN'],
  },
  PLACED: {
    ACCEPTED: ['RESTAURANT', 'ADMIN'],
    REJECTED_BY_RESTAURANT: ['RESTAURANT', 'ADMIN'],
    EXPIRED: ['SYSTEM', 'ADMIN'], // 3-minute timeout worker
    CANCELLED: ['CUSTOMER', 'ADMIN'],
  },
  ACCEPTED: {
    PREPARING: ['RESTAURANT', 'ADMIN', 'SYSTEM'],
    CANCELLED: ['ADMIN', 'RESTAURANT'],
  },
  PREPARING: {
    READY: ['RESTAURANT', 'ADMIN'],
    CANCELLED: ['ADMIN'], // Only admin can cancel once kitchen starts cooking
  },
  READY: {
    PICKED_UP: ['RIDER', 'ADMIN'],
    CANCELLED: ['ADMIN'],
  },
  PICKED_UP: {
    DELIVERED: ['RIDER', 'ADMIN'],
    FAILED_DELIVERY: ['RIDER', 'ADMIN'],
  },
  // Terminal states have no transitions out
  PAYMENT_FAILED: {},
  REJECTED_BY_RESTAURANT: {},
  EXPIRED: {},
  CANCELLED: {},
  DELIVERED: {},
  FAILED_DELIVERY: {},
};

/**
 * Pure Order State Machine Transition Evaluator
 */
export function transitionOrder(
  currentStatus: OrderStatus,
  targetStatus: OrderStatus,
  context: TransitionContext
): TransitionResult {
  const { actorRole, actorId, payload } = context;

  if (currentStatus === targetStatus) {
    return {
      ok: false,
      fromStatus: currentStatus,
      toStatus: targetStatus,
      code: 'ILLEGAL_TRANSITION',
      error: `Order is already in status '${currentStatus}'.`,
    };
  }

  // Check terminal state
  if ((TERMINAL_ORDER_STATUSES as readonly string[]).includes(currentStatus)) {
    return {
      ok: false,
      fromStatus: currentStatus,
      toStatus: targetStatus,
      code: 'TERMINAL_STATE',
      error: `Cannot transition order from terminal status '${currentStatus}' to '${targetStatus}'.`,
    };
  }

  const allowedTargetRoles = TRANSITION_RULES[currentStatus]?.[targetStatus];
  if (!allowedTargetRoles) {
    return {
      ok: false,
      fromStatus: currentStatus,
      toStatus: targetStatus,
      code: 'ILLEGAL_TRANSITION',
      error: `Transition from '${currentStatus}' to '${targetStatus}' is not allowed.`,
    };
  }

  // Authorization check
  if (!allowedTargetRoles.includes(actorRole)) {
    return {
      ok: false,
      fromStatus: currentStatus,
      toStatus: targetStatus,
      code: 'UNAUTHORIZED_ACTOR',
      error: `Role '${actorRole}' is not authorized to transition order from '${currentStatus}' to '${targetStatus}'. Allowed: [${allowedTargetRoles.join(', ')}].`,
    };
  }

  // Payload validations
  if (targetStatus === 'REJECTED_BY_RESTAURANT') {
    if (!payload?.rejectionReason || typeof payload.rejectionReason !== 'string' || !payload.rejectionReason.trim()) {
      return {
        ok: false,
        fromStatus: currentStatus,
        toStatus: targetStatus,
        code: 'MISSING_PAYLOAD',
        error: `Transition to 'REJECTED_BY_RESTAURANT' requires a non-empty 'rejectionReason'.`,
      };
    }
  }

  if (targetStatus === 'FAILED_DELIVERY') {
    if (!payload?.failureReason || typeof payload.failureReason !== 'string' || !payload.failureReason.trim()) {
      return {
        ok: false,
        fromStatus: currentStatus,
        toStatus: targetStatus,
        code: 'MISSING_PAYLOAD',
        error: `Transition to 'FAILED_DELIVERY' requires a non-empty 'failureReason'.`,
      };
    }
  }

  if (targetStatus === 'ACCEPTED') {
    if (payload?.prepTimeMinutes !== undefined) {
      if (typeof payload.prepTimeMinutes !== 'number' || payload.prepTimeMinutes <= 0 || payload.prepTimeMinutes > 300) {
        return {
          ok: false,
          fromStatus: currentStatus,
          toStatus: targetStatus,
          code: 'MISSING_PAYLOAD',
          error: `'prepTimeMinutes' must be a positive integer between 1 and 300 minutes.`,
        };
      }
    }
  }

  return {
    ok: true,
    fromStatus: currentStatus,
    toStatus: targetStatus,
    actorRole,
    actorId,
    payload,
    timestamp: new Date().toISOString(),
  };
}
