# `/scheduler` 프론트엔드 전용 14일 급여 계산 기능

## 1. 기본 원칙

현재 `/scheduler` 페이지에서 이미 불러온 스케줄 데이터만 사용하여 급여를 계산한다.

- 기존 스케줄 데이터베이스는 그대로 사용
- 급여용 데이터베이스 추가 없음
- 백엔드 API 수정 없음
- 급여 계산 결과 저장 없음
- 프론트엔드에서만 계산
- 계산 결과는 현재 화면에서만 표시
- 페이지를 새로고침하면 계산 결과 초기화 가능

---

## 2. 급여 기간

관리자가 급여 시작일을 선택하면 해당 날짜를 포함하여 총 14일을 계산한다.

```text
급여 종료일 = 시작일 + 13일
급여 지급일 = 시작일 + 14일
```

예시:

| 시작일 | 급여 계산 기간 | 지급일 |
|---|---|---|
| 2026-06-01 | June 1st - 14th | June 15th |
| 2026-06-15 | June 15th - 28th | June 29th |
| 2026-06-29 | June 29th - July 12th | July 13th |

---

## 3. 급여 계산 규칙

### 두 직원이 같은 날짜에 모두 근무한 경우

Berlyn과 Janice에게 각각 ₱500을 지급한다.

```text
Berlyn = ₱500
Janice = ₱500
```

근무 시간이 서로 달라도 같은 날짜에 두 직원의 스케줄이 모두 있으면 각각 ₱500으로 계산한다.

예:

```text
Berlyn: Morning
Janice: Evening
```

### 한 직원만 근무한 경우

해당 날짜에 혼자 근무한 직원에게 ₱650을 지급한다.

```text
근무한 직원 = ₱650
근무하지 않은 직원 = ₱0
```

### 하루에 여러 스케줄이 등록된 경우

한 직원에게 같은 날짜에 여러 스케줄이 있어도 하루 급여는 한 번만 계산한다.

```text
Morning + Evening = 근무일 1일
```

---

## 4. 공휴일 수당

공휴일에 근무한 직원에게 하루당 ₱150을 추가한다.

```text
공휴일 추가 수당 = ₱150 × 공휴일 근무일 수
```

공휴일이 없으면:

```text
공휴일: 없음
```

공휴일이 있으면 상세 급여 내역에 자동으로 표시한다.

예:

```text
Holiday extra
₱150 × 2 days = ₱300
```

---

## 5. 공휴일 선택박스

급여 계산 영역에 공휴일 근무일 수를 선택할 수 있는 선택박스를 추가한다.

선택 가능한 값:

```text
없음
1일
2일
3일
4일
5일
6일
7일
```

UI 예시:

```text
공휴일 근무일 수

[ 없음 ▼ ]
```

공휴일이 있는 경우:

```text
공휴일 근무일 수

[ 2일 ▼ ]
```

직원마다 공휴일 근무일 수가 다를 수 있으므로 Berlyn과 Janice 각각 선택할 수 있게 한다.

```text
Janice 공휴일 근무일 수
[ 없음 ▼ ]

Berlyn 공휴일 근무일 수
[ 없음 ▼ ]
```

선택값은 데이터베이스에 저장하지 않고 프론트엔드 상태에서만 사용한다.

---

## 6. 급여 계산 UI

`/scheduler` 관리자 화면의 `SCHEDULER CONTROL` 아래에 다음 영역을 추가한다.

```text
PAYROLL CALCULATOR

급여 시작일
[ 2026-06-15 ]

급여 종료일
2026-06-28

지급일
2026-06-29

Janice 공휴일 근무일 수
[ 없음 ▼ ]

Berlyn 공휴일 근무일 수
[ 없음 ▼ ]

[14일 급여 계산]
```

달력의 날짜를 클릭하여 급여 시작일을 선택할 수도 있다.

```text
[이 날짜부터 14일 급여 계산]
```

---

## 7. 계산 결과 표시

급여를 계산하면 다음 정보를 표시한다.

```text
급여 기간: June 15th - 28th
지급일: June 29th
```

| 직원 | 같이 근무 | 혼자 근무 | 공휴일 | 총 급여 |
|---|---:|---:|---:|---:|
| Janice | 10 × ₱500 | 3 × ₱650 | 없음 | ₱6,950 |
| Berlyn | 10 × ₱500 | 1 × ₱650 | 없음 | ₱5,650 |

공휴일이 있는 경우:

| 직원 | 같이 근무 | 혼자 근무 | 공휴일 | 총 급여 |
|---|---:|---:|---:|---:|
| Janice | 10 × ₱500 | 3 × ₱650 | 2 × ₱150 | ₱7,250 |
| Berlyn | 10 × ₱500 | 1 × ₱650 | 1 × ₱150 | ₱5,800 |

---

## 8. 직원 전달용 상세 텍스트 상자

급여 계산 후에는 **상세 형식만** 표시한다.

간단 형식 선택 기능은 만들지 않는다.

직원별로 복사 가능한 텍스트 상자를 제공한다.

```text
[Janice 복사]
[Berlyn 복사]
[전체 복사]
```

텍스트 상자는 관리자가 복사하기 전에 직접 수정할 수 있도록 한다.

---

## 9. 공휴일이 없는 상세 형식

### Janice

```text
June 15th - 28th

Janice

₱500 × 10 days = ₱5,000
₱650 × 3 days = ₱1,950

Total = ₱6,950
```

### Berlyn

```text
June 15th - 28th

Berlyn

₱500 × 10 days = ₱5,000
₱650 × 1 day = ₱650

Total = ₱5,650
```

공휴일 선택값이 `없음` 또는 `0일`이면 공휴일 문장은 표시하지 않는다.

---

## 10. 공휴일이 있는 상세 형식

### Janice 공휴일 2일

```text
June 15th - 28th

Janice

₱500 × 10 days = ₱5,000
₱650 × 3 days = ₱1,950
Holiday extra
₱150 × 2 days = ₱300

Total = ₱7,250
```

### Berlyn 공휴일 1일

```text
June 15th - 28th

Berlyn

₱500 × 10 days = ₱5,000
₱650 × 1 day = ₱650
Holiday extra
₱150 × 1 day = ₱150

Total = ₱5,800
```

---

## 11. 전체 복사 형식

```text
June 15th - 28th

Janice

₱500 × 10 days = ₱5,000
₱650 × 3 days = ₱1,950
Holiday extra
₱150 × 2 days = ₱300

Total = ₱7,250


Berlyn

₱500 × 10 days = ₱5,000
₱650 × 1 day = ₱650
Holiday extra
₱150 × 1 day = ₱150

Total = ₱5,800
```

---

## 12. 공휴일 선택값

```ts
const HOLIDAY_DAY_OPTIONS = [
  { label: "없음", value: 0 },
  { label: "1일", value: 1 },
  { label: "2일", value: 2 },
  { label: "3일", value: 3 },
  { label: "4일", value: 4 },
  { label: "5일", value: 5 },
  { label: "6일", value: 6 },
  { label: "7일", value: 7 },
];
```

React state 예시:

```tsx
const [janiceHolidayDays, setJaniceHolidayDays] =
  useState<number>(0);

const [berlynHolidayDays, setBerlynHolidayDays] =
  useState<number>(0);
```

선택박스 예시:

```tsx
<label>
  Janice 공휴일 근무일 수

  <select
    value={janiceHolidayDays}
    onChange={(event) =>
      setJaniceHolidayDays(Number(event.target.value))
    }
  >
    {HOLIDAY_DAY_OPTIONS.map((option) => (
      <option
        key={option.value}
        value={option.value}
      >
        {option.label}
      </option>
    ))}
  </select>
</label>

<label>
  Berlyn 공휴일 근무일 수

  <select
    value={berlynHolidayDays}
    onChange={(event) =>
      setBerlynHolidayDays(Number(event.target.value))
    }
  >
    {HOLIDAY_DAY_OPTIONS.map((option) => (
      <option
        key={option.value}
        value={option.value}
      >
        {option.label}
      </option>
    ))}
  </select>
</label>
```

---

## 13. 급여 결과 타입

```ts
interface PayrollEmployeeResult {
  sharedDays: number;
  soloDays: number;
  holidayDays: number;

  sharedPay: number;
  soloPay: number;
  holidayPay: number;

  totalPay: number;
}
```

공휴일 수당 계산:

```ts
const holidayPay = holidayDays * 150;
```

최종 급여 계산:

```ts
const totalPay =
  sharedPay +
  soloPay +
  holidayPay;
```

---

## 14. 상세 텍스트 생성 함수

```ts
function formatPeso(amount: number): string {
  return `₱${amount.toLocaleString("en-PH")}`;
}

function formatDayCount(count: number): string {
  return count === 1 ? "1 day" : `${count} days`;
}

function createDetailedPayrollText({
  periodLabel,
  employeeName,
  sharedDays,
  soloDays,
  holidayDays,
}: {
  periodLabel: string;
  employeeName: string;
  sharedDays: number;
  soloDays: number;
  holidayDays: number;
}): string {
  const sharedPay = sharedDays * 500;
  const soloPay = soloDays * 650;
  const holidayPay = holidayDays * 150;

  const totalPay =
    sharedPay +
    soloPay +
    holidayPay;

  const lines = [
    periodLabel,
    "",
    employeeName,
    "",
  ];

  if (sharedDays > 0) {
    lines.push(
      `₱500 × ${formatDayCount(sharedDays)} = ${formatPeso(
        sharedPay
      )}`
    );
  }

  if (soloDays > 0) {
    lines.push(
      `₱650 × ${formatDayCount(soloDays)} = ${formatPeso(
        soloPay
      )}`
    );
  }

  if (holidayDays > 0) {
    lines.push("Holiday extra");
    lines.push(
      `₱150 × ${formatDayCount(holidayDays)} = ${formatPeso(
        holidayPay
      )}`
    );
  }

  lines.push("");
  lines.push(`Total = ${formatPeso(totalPay)}`);

  return lines.join("\n");
}
```

---

## 15. 복사 가능한 상세 텍스트 상자

```tsx
const [janiceCopyText, setJaniceCopyText] =
  useState("");

const [berlynCopyText, setBerlynCopyText] =
  useState("");
```

급여를 계산한 후 상세 텍스트를 생성한다.

```tsx
function updatePayrollCopyText() {
  const janiceText = createDetailedPayrollText({
    periodLabel,
    employeeName: "Janice",
    sharedDays:
      payrollResult.employees.Janice.sharedDays,
    soloDays:
      payrollResult.employees.Janice.soloDays,
    holidayDays: janiceHolidayDays,
  });

  const berlynText = createDetailedPayrollText({
    periodLabel,
    employeeName: "Berlyn",
    sharedDays:
      payrollResult.employees.Berlyn.sharedDays,
    soloDays:
      payrollResult.employees.Berlyn.soloDays,
    holidayDays: berlynHolidayDays,
  });

  setJaniceCopyText(janiceText);
  setBerlynCopyText(berlynText);
}
```

UI 예시:

```tsx
<section className="payroll-copy-section">
  <div className="payroll-copy-card">
    <div className="payroll-copy-header">
      <h3>Janice 상세 급여 내역</h3>

      <button
        type="button"
        onClick={() =>
          navigator.clipboard.writeText(janiceCopyText)
        }
      >
        복사
      </button>
    </div>

    <textarea
      value={janiceCopyText}
      onChange={(event) =>
        setJaniceCopyText(event.target.value)
      }
      rows={10}
    />
  </div>

  <div className="payroll-copy-card">
    <div className="payroll-copy-header">
      <h3>Berlyn 상세 급여 내역</h3>

      <button
        type="button"
        onClick={() =>
          navigator.clipboard.writeText(berlynCopyText)
        }
      >
        복사
      </button>
    </div>

    <textarea
      value={berlynCopyText}
      onChange={(event) =>
        setBerlynCopyText(event.target.value)
      }
      rows={10}
    />
  </div>

  <button
    type="button"
    onClick={() =>
      navigator.clipboard.writeText(
        `${janiceCopyText}\n\n\n${berlynCopyText}`
      )
    }
  >
    전체 상세 급여 내역 복사
  </button>
</section>
```

---

## 16. 구현 범위

### 추가할 기능

- 급여 시작일 선택
- 선택일부터 14일간 스케줄 계산
- 두 명이 모두 근무한 날짜 계산
- 혼자 근무한 날짜 계산
- Janice 공휴일 근무일 수 선택박스
- Berlyn 공휴일 근무일 수 선택박스
- 공휴일 0일에서 7일까지 선택
- 직원별 상세 급여 텍스트 상자
- 직원별 복사 버튼
- 전체 상세 내역 복사 버튼
- 복사 전 텍스트 직접 수정

### 추가하지 않는 기능

- 간단 형식
- 상세·간단 형식 전환 버튼
- 급여 데이터베이스
- 급여 저장 API
- Prisma 또는 Supabase 변경
- 급여 지급 상태 관리
- 과거 급여 기록 저장

---

## 17. 완료 조건

1. `/scheduler`의 기존 스케줄 데이터를 사용한다.
2. 관리자가 급여 시작일을 선택할 수 있다.
3. 선택한 날짜부터 정확히 14일을 계산한다.
4. 같은 날짜에 두 직원 모두 근무하면 각각 ₱500이다.
5. 한 직원만 근무하면 해당 직원에게 ₱650이다.
6. 직원별 공휴일 근무일 수를 `없음`부터 `7일`까지 선택할 수 있다.
7. 선택한 공휴일 수만큼 하루당 ₱150을 추가한다.
8. 공휴일이 없으면 상세 텍스트에 공휴일 항목을 표시하지 않는다.
9. 공휴일이 있으면 상세 텍스트에 공휴일 수당을 표시한다.
10. 직원별 상세 형식만 표시한다.
11. 직원별 텍스트를 복사할 수 있다.
12. 전체 상세 급여 내역을 복사할 수 있다.
13. 급여 계산 결과는 데이터베이스에 저장하지 않는다.
