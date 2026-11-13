import { ageOn, onTimePercent, stepProblems } from './riders.models';

const now = new Date(Date.UTC(2026, 10, 14));

describe('rider portal checks', () => {
  it('step 1: personal details', () => {
    expect(stepProblems({}, 0, now)).toEqual([
      'Enter your full name.',
      'Enter a 10-digit mobile number.',
      'Enter your date of birth.',
      'Enter your home address.',
      'Choose where you want to deliver.',
    ]);
    expect(
      stepProblems(
        {
          fullName: 'Raju M',
          phone: '98000 11111',
          dob: '2000-01-01',
          address: 'Station Road, Purulia',
          serviceAreaId: 'a',
        },
        0,
        now,
      ),
    ).toEqual([]);
  });

  it('step 2: licence only for motor vehicles', () => {
    expect(stepProblems({ vehicleType: 'cycle' }, 1, now)).toEqual([]);
    expect(stepProblems({ vehicleType: 'bike', vehicleNumber: 'wb 56 ab 1234' }, 1, now)).toEqual([
      'Enter your driving licence number.',
    ]);
  });

  it('step 3: documents depend on the vehicle', () => {
    const docs = { aadhaarFront: 'a', aadhaarBack: 'b', selfie: 's' };
    expect(stepProblems({ vehicleType: 'cycle', docs }, 2, now)).toEqual([]);
    expect(stepProblems({ vehicleType: 'scooter', docs }, 2, now)).toEqual([
      'Upload: Driving licence.',
      'Upload: Vehicle RC.',
    ]);
  });

  it('step 4: UPI or bank', () => {
    const bank = {
      method: 'bank' as const,
      upiId: '',
      accountName: 'Raju',
      accountNumber: '12',
      ifsc: 'sbin0001234',
    };
    expect(stepProblems({ payoutInput: bank }, 3, now)).toEqual([
      'Account number must be 9–18 digits.',
    ]);
    expect(
      stepProblems({ payoutInput: { ...bank, method: 'upi', upiId: 'raju@okaxis' } }, 3, now),
    ).toEqual([]);
  });

  it('helpers', () => {
    expect(ageOn('2008-11-15', now)).toBe(17);
    expect(onTimePercent({ deliveredCount: 0, onTimeCount: 0 })).toBeNull();
    expect(onTimePercent({ deliveredCount: 3, onTimeCount: 2 })).toBe(67);
  });
});
