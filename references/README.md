# 참고용 원본

PDMaker가 직접 쓰지 않는, 참고용으로 모아 둔 원본 코드입니다. 빌드에는 들어가지 않습니다.

| 폴더 | 원래 위치 | 내용 |
|---|---|---|
| `mod2-buffs/` | `Pixel Dungeon modding/buffs/` | 아리아 전용 버프(패키지 `actors.buffs`) |

`mod2-buffs/`의 버프:

- **Brand (검은 태양 낙인)**: 중첩될수록 받는 피해가 늘어납니다. 만료되면 남은 중첩이 시전자의 보호막으로 바뀝니다.
- **InkMark (잉크 표식)**: 코덱스에 맞을 때마다 중첩됩니다. 중첩당 코덱스 피해가 늘어나고, 선택적으로 이동이 둔해집니다. 만료되면 보호막으로 바꾸는 훅이 있습니다.
- **Overheat (과열)**: 원소 과열 게이지(0~100)입니다.
  - 같은 원소를 유지하거나 스킬·코덱스를 쓰면 올라갑니다.
  - 피해·받는 피해·회피 보정이 붙습니다.
  - 100이 되면 멜트다운(광역 피해)이 일어납니다.

게임에 넣으려면 `shattered-pixel-dungeon-mod-2/core/src/main/java/com/shatteredpixel/shatteredpixeldungeon/actors/buffs/`에 복사합니다.
PDMaker 영웅 코드 칸에서는 `Buff.affect(enemy, Brand.class)`처럼 씁니다. 아이콘은 `BuffIndicator`를 따릅니다.
