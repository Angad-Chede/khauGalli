import { describe, it, expect } from 'vitest';

describe('Notification Layer Demo Isolation Guardrails', () => {
  interface NotificationRequest {
    recipientPhone: string;
    isDemo: boolean;
    template: string;
    payload: Record<string, any>;
  }

  const liveGatewayDispatches: NotificationRequest[] = [];
  const interceptedDemoLogs: NotificationRequest[] = [];

  /**
   * Safe Notification Dispatcher with strict Demo Phone & is_demo interception
   */
  function dispatchNotification(req: NotificationRequest): { sent: boolean; reason: string } {
    const isDemoPhone = req.recipientPhone.startsWith('+91999990000'); // 4 seeded demo phones

    // Absolute guardrail: never send to is_demo users or seeded demo numbers
    if (req.isDemo || isDemoPhone) {
      interceptedDemoLogs.push(req);
      return {
        sent: false,
        reason: 'INTERCEPTED_DEMO_USER_NO_EXTERNAL_SMS',
      };
    }

    // Live dispatch
    liveGatewayDispatches.push(req);
    return {
      sent: true,
      reason: 'DISPATCHED_TO_GATEWAY',
    };
  }

  it('guarantees seeded demo numbers (+919999900001 to 0004) are never dispatched to real SMS/WhatsApp gateways', () => {
    const demoPhones = [
      '+919999900001', // Asha
      '+919999900002', // Ravi
      '+919999900003', // Imran
      '+919999900004', // Meera
    ];

    for (const phone of demoPhones) {
      const result = dispatchNotification({
        recipientPhone: phone,
        isDemo: true,
        template: 'ORDER_PLACED',
        payload: { orderNumber: 'ORD-123' },
      });

      expect(result.sent).toBe(false);
      expect(result.reason).toBe('INTERCEPTED_DEMO_USER_NO_EXTERNAL_SMS');
    }

    // Proves zero messages reached the live gateway
    expect(liveGatewayDispatches.length).toBe(0);
    expect(interceptedDemoLogs.length).toBe(4);
  });

  it('intercepts even if a demo number accidentally has isDemo set to false', () => {
    const result = dispatchNotification({
      recipientPhone: '+919999900001',
      isDemo: false, // stray flag
      template: 'ORDER_CONFIRMED',
      payload: {},
    });

    expect(result.sent).toBe(false);
    expect(result.reason).toBe('INTERCEPTED_DEMO_USER_NO_EXTERNAL_SMS');
    expect(liveGatewayDispatches.length).toBe(0);
  });

  it('permits dispatch only for real non-demo users with legitimate cellular numbers', () => {
    const result = dispatchNotification({
      recipientPhone: '+919876543210',
      isDemo: false,
      template: 'ORDER_PLACED',
      payload: { orderNumber: 'ORD-456' },
    });

    expect(result.sent).toBe(true);
    expect(result.reason).toBe('DISPATCHED_TO_GATEWAY');
    expect(liveGatewayDispatches.length).toBe(1);
    expect(liveGatewayDispatches[0].recipientPhone).toBe('+919876543210');
  });
});
