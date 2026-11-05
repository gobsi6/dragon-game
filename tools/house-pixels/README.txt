내 집터 도트 그림 묶음

■ 들어 있는 것
plots/<집터>-done.png      되살리고 꾸민 모습 (146×110 도트, 1배 원본)
plots/<집터>-ruin.png      처음 무너진 모습
plots/*@4x.png             게임 화면 크기 미리보기 (1도트 = 4px). 손볼 때는 1배 원본을 쓰세요.
sprites/<이름>.png          가구·장식 하나씩 (투명 배경, 1배)
palette.gpl                색 팔레트 (Aseprite, GIMP, Krita에서 불러오기)
gen.py                     위 그림을 모두 만드는 코드 (python3 gen.py <폴더>, Pillow 필요)

집터 이름: spring 샘가 집 · green 온실 옆 집 · archive 서고 뒤 집 · forge 대장간 골목 집 · belfry 종탑 아래 집 · plaza 광장 앞 집

■ 도면 뼈대 (도트 좌표, 모든 집터 같음)
거처   x49 y6  48×29     마당  x49 y39 48×47
작업실 x101 y39 41×44    고유 칸(왼쪽) x6 y39 40×44
입구 길 x66~79, 아래쪽

■ 손보는 두 가지 방법
1) 그림을 직접 고치기: plots/*.png 1배 원본을 Aseprite 같은 도트 편집기에서 열고 palette.gpl을 불러와 그 색만 쓰면 됩니다.
2) 부품을 고치기: sprites/*.png를 고치고 python3 gen.py . 을 다시 실행하면 모든 집터 그림에 한꺼번에 반영됩니다.
   게임에도 반영하려면 저장소 맨 위에서 python3 tools/house-pixels/sync.py 를 실행하세요.
   (public/index.html의 도면 그림 데이터와 city.js의 장식 크기를 새로 씁니다)
   팔레트에 없는 색을 쓰면 자동으로 새 색으로 등록됩니다 (palette.gpl에 "추가 색"으로 나옴).

■ 색 규칙
초목(잎), 물(연못·우물·창), 불(화덕)만 제 색을 쓰고, 나머지는 모두 베이지~갈색 계열입니다.
