# Mr. Moon 결제 가격 기준 일치

- 증상: Sell 화면은 장바구니 `unitPricePhp`에 할인했지만 checkout은 남아 있는 `originalUnitPricePhp`를 우선해 다른 가격을 저장할 수 있었다.
- 변경: 유료 항목의 `list_price`와 할인 계산 기준을 화면과 동일한 현재 `unitPricePhp`로 통일했다. 증정품(`unitPricePhp === 0`)의 원가 보존은 유지한다.
- 검증: `unitPricePhp=1300`, `originalUnitPricePhp=1400`, Mr. Moon 선택 시 온라인·오프라인 모두 `list_price=1300`, `price=1200`을 확인했다.
- 범위: DB 구조와 API 계약 변경 없음. 운영 데이터는 수정하지 않았다.
