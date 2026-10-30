# Mr. Moon 결제 가격 기준 일치

- 증상: Sell 화면은 장바구니 `unitPricePhp`에 할인했지만 checkout은 남아 있는 `originalUnitPricePhp`를 우선해 다른 가격을 저장할 수 있었다.
- 변경: 유료 항목의 `list_price`와 할인 계산 기준을 화면과 동일한 현재 `unitPricePhp`로 통일했다. 증정품(`unitPricePhp === 0`)의 원가 보존은 유지한다.
- 검증: `unitPricePhp=1300`, `originalUnitPricePhp=1400`, Mr. Moon 선택 시 온라인·오프라인 모두 `list_price=1300`, `price=1200`을 확인했다.
- 범위: DB 구조와 API 계약 변경 없음. 운영 데이터는 수정하지 않았다.

## 추가 확인 및 후속 수정

- 10월 30일 `GM-TP-NK-WH-02` 판매 행은 `list_price=4900`, `price=4900`, `guide_id=7`(MR.MOON)으로 저장됐다. 앞선 가격 기준 수정만으로 해결되지 않았다.
- 결제 시 가이드 재조회가 실패하면 판매를 시작하기 전에 오류를 표시한다. 판매내역에서 가이드 변경 시 가격 갱신 오류를 성공으로 무시하지 않는다.
- 모의 온라인 결제·가이드 변경 테스트에서 조회 실패 시 INSERT 차단, 정상 할인 4500 적용, 가격 갱신 실패 전달을 확인했다. 실제 브라우저 재시험은 필요하다.
