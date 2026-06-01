# Employee Schedule Auto Generation Specification

## 저장 방식

근무표는 `employee_schedules` 테이블에 저장한다.

### 저장 컬럼

| 컬럼              | 설명                                      |
| ----------------- | ----------------------------------------- |
| employee_id       | 직원 UUID                                 |
| work_date         | 근무 날짜                                 |
| shift_type        | `morning`, `evening`, `all_day`, `manual` |
| manual_start_time | 수동 스케줄 시작 시간 (`manual`일 때만)   |
| manual_hours      | 수동 스케줄 근무 시간 (`manual`일 때만)   |

---

## shift_type 의미

| shift_type | 의미                      |
| ---------- | ------------------------- |
| morning    | 오픈조                    |
| evening    | 마감조                    |
| all_day    | 단독근무                  |
| manual     | 직접 입력한 시간제로 근무 |

---

## 시간 표시 규칙

### 일반 평일 (월, 화, 목)

| shift_type | 시간        |
| ---------- | ----------- | ------ |
| morning    | 06:00~12:00 | 6 hr   |
| evening    | 11:30~17:00 | 5.5 hr |

---

### 피크일 (금, 토, 일) 6.5 hr

| shift_type | 시간        |
| ---------- | ----------- | ----- |
| morning    | 06:00~12:30 | 6.5hr |
| evening    | 11:00~17:00 | 6hr   |

금/토/일은 반드시 2명이 근무해야 한다.

---

### 수요일 (비수기 단독근무)

| shift_type | 시간        |
| ---------- | ----------- |
| all_day    | 08:00~16:00 |

수요일은 직원 1명만 배치한다.

---

### 수동 입력

| shift_type | 시간                                         |
| ---------- | -------------------------------------------- |
| manual     | 관리자가 `시작 시간` + `몇 시간`을 직접 입력 |

수동 입력은 `Scheduler`의 `Manual Schedule`에서 사용한다.

---

# 직원 정책

## Maeshi

- 화요일 고정
- 수요일 고정
- 화요일은 항상 `evening`
- 수요일은 항상 `all_day`
- Auto 생성 시 강제 배치

---

## Berlyn

- Janice와 격주 교대
- morning/evening 교대
- 격주 휴무 적용

---

## Janice

- Berlyn과 격주 교대
- morning/evening 교대
- 격주 휴무 적용

---

# 격주 스케줄

## Week A

| 요일 | Morning          | Evening |
| ---- | ---------------- | ------- |
| 월   | Berlyn           | Janice  |
| 화   | Janice           | Maeshi  |
| 수   | Maeshi (all_day) | -       |
| 목   | Berlyn           | Janice  |
| 금   | Berlyn           | Janice  |
| 토   | Berlyn           | Janice  |
| 일   | Berlyn           | Janice  |

### 휴무

- Berlyn : 수요일
- Janice : 화요일

---

## Week B

| 요일 | Morning          | Evening |
| ---- | ---------------- | ------- |
| 월   | Janice           | Berlyn  |
| 화   | Berlyn           | Maeshi  |
| 수   | Maeshi (all_day) | -       |
| 목   | Janice           | Berlyn  |
| 금   | Janice           | Berlyn  |
| 토   | Janice           | Berlyn  |
| 일   | Janice           | Berlyn  |

### 휴무

- Janice : 수요일
- Berlyn : 화요일

---

# Auto 버튼 생성 규칙

1. 선택한 날짜가 포함된 주(월~일)를 계산한다.
2. 해당 주가 Week A 또는 Week B인지 계산한다.
3. 기존 스케줄을 삭제한다.
4. Week A 또는 Week B 규칙에 따라 자동 생성한다.
5. 화요일은 Maeshi를 evening으로 자동 배치한다.
6. 수요일은 Maeshi를 all_day로 자동 배치한다.
7. 금/토/일은 피크일 규칙을 적용한다.
8. Berlyn과 Janice는 격주로 morning/evening을 교대한다.
9. 생성 후 Supabase에 저장한다.

---

# Supabase 저장 예시

```js
const rows = [
  {
    employee_id: berlynId,
    work_date: '2026-06-01',
    shift_type: 'morning',
  },
  {
    employee_id: janiceId,
    work_date: '2026-06-01',
    shift_type: 'evening',
  },
  {
    employee_id: maeshiId,
    work_date: '2026-06-03',
    shift_type: 'all_day',
  },
];

await supabase.from('employee_schedules').insert(rows);
```

---

# Auto 생성 전 삭제

```js
await supabase
  .from('employee_schedules')
  .delete()
  .gte('work_date', startDate)
  .lte('work_date', endDate);
```

---

# 드래그 수정 저장 방식

직원 또는 Shift를 드래그해서 변경하면 update 수행

```js
await supabase
  .from('employee_schedules')
  .update({
    employee_id: newEmployeeId,
    shift_type: newShiftType,
  })
  .eq('id', scheduleId);
```

---

# 검증 규칙

1. 같은 직원은 같은 날짜에 1회만 배치 가능
2. Maeshi는 화요일 evening만 가능
3. Maeshi는 수요일 all_day만 가능
4. 수요일은 all_day 1명만 가능
5. 금/토/일은 morning + evening 둘 다 존재해야 함
6. 금/토/일은 11:00~13:00 피크시간 2명 근무 유지
7. 하루 최대 2명까지만 저장 가능
8. 직원 중복 배치 금지

---

# 현재 DB 제약

```sql
UNIQUE (employee_id, work_date)
```

```sql
cnt >= 2
```

현재 DB 구조에서는:

- 월, 화, 목, 금, 토, 일 → 최대 2명
- 수요일 → 1명(all_day)

구조를 지원한다.

---

# UI 표시 예시

| 요일 | 직원   | Shift   | 시간        |
| ---- | ------ | ------- | ----------- |
| 월   | Berlyn | morning | 06:00~12:00 |
| 월   | Janice | evening | 11:30~17:30 |
| 화   | Janice | morning | 06:00~12:00 |
| 화   | Maeshi | evening | 11:30~17:30 |
| 수   | Maeshi | all_day | 08:00~16:00 |
| 금   | Berlyn | morning | 06:00~13:00 |
| 금   | Janice | evening | 11:00~17:30 |

```

```
