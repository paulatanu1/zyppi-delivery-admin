import { callableErrorMessage } from './callable';

describe('callableErrorMessage', () => {
  it('explains an App Check refusal', () => {
    expect(
      callableErrorMessage({ code: 'functions/unauthenticated', message: 'APP_CHECK_FAILED' }),
    ).toContain('Reload');
  });

  it('keeps the server message for expected errors only', () => {
    expect(callableErrorMessage({ code: 'functions/not-found', message: 'Chat not found' })).toBe(
      'Chat not found',
    );
    expect(callableErrorMessage({ code: 'functions/internal', message: 'boom' })).toBe(
      'Something went wrong. Please try again.',
    );
  });

  it('explains barcode reason codes', () => {
    expect(
      callableErrorMessage({ code: 'functions/already-exists', message: 'DUPLICATE_BARCODE' }),
    ).toContain('already on another product');
  });
});
