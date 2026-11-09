# 내 집터 팩 그림 (house-pack)

게임이 쓰는 파일은 `public/house/pack.json` 하나예요. 집터 바탕·앞쪽 벽·가구 그림(PNG를 글자로 넣은 것)과
칸 좌표, 가구 크기·층, 집터별 기본 배치, 가구 값·도면, 바닥·벽 타일과 그 자리 표시가 모두 들어 있어요.
화면(`public/index.html`의 HP)과 서버(`city.js`의 PACK)가 같은 파일을 읽어서 놓는 규칙이 어긋나지 않아요.

## 그림 출처 (크레딧 표기 필수)
- Fantasy RPG Interior pack (+ Workshop·Bedroom·School·Music·Alchemy Lab 확장), Fantasy RPG asset pack, RPG Castles asset pack — **Franuka** https://franuka.itch.io/ · https://x.com/franuka_art
- 라이선스: 상업·비상업 사용 가능, 수정 가능. **팩 원본을 그대로 재배포·재판매하면 안 되고**, itch 페이지나 X 링크를 표기해 달라고 되어 있어요.
- 종 받침대(`src/bellstand.png`)와 방명록 받침의 종이, 텃밭(흙+작물 조립)은 직접 그리거나 조립한 것이에요.

## 다시 만들기
`src/`의 파이썬 스크립트는 처음 만들 때 쓴 것이에요(원본 팩 파일 경로를 맞춰야 돌아가요). 순서:
1. `src/scene_tile9.py` · `src/export_editor.py` — 타일 맞춤 집터 바탕, 앞쪽 벽 층, 가구 그림(색 다듬기 포함)
2. `src/export_mask_y.py` — 바닥·벽·마당 바닥 자리 표시
3. `src/plots.py` — 여섯 집터 고유 칸 기본 배치
4. `make_pack.py` — 위 결과를 모아 `public/house/pack.json`으로 (게임 가구 이름으로 바꾸고 기본 가구 수 셈)
5. `add_pond.py` — `src/pond.png`(다듬은 연못)을 넣고 연잎·물결 흔들림 장면을 만들고, 샘가 집 기본 배치를 연못으로 (pack.json v2)
6. `fix_shade.py` — 방 바닥의 벽 밑 그늘이 옆문 쪽에서 끊긴 것을 이어 그림
7. `rules.py` — 기본 배치가 놓는 규칙에 맞는지 확인

색 규칙: 붉은·자줏빛만 원목 갈색으로(채도 90%), 벽·바닥은 베이지(채도 70% 안팎), 불 들어가는 가구는 불꽃은 그대로 두고 틀만 살짝,
깔개는 원래 색. 같은 가구의 색 변형은 한 가지만 넣어요.
