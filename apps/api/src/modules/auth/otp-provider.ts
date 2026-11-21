export interface OtpProvider {
  sendOtp(phone: string, code: string): Promise<void>;
}

export class MockOtpProvider implements OtpProvider {
  async sendOtp(phone: string, code: string): Promise<void> {
    console.log(
      JSON.stringify({
        event: 'MOCK_OTP_DISPATCH',
        channel: 'SMS_MOCK',
        recipient: phone,
        code: code,
        timestamp: new Date().toISOString(),
        message: `Your Tiffin verification code is: ${code}. Valid for 5 minutes.`,
      })
    );
  }
}

export const defaultOtpProvider = new MockOtpProvider();
