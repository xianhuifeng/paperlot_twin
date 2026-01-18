#!/usr/bin/env bash
set -e

BASE="http://localhost:3000"
LOT="001"

# 每次运行一个批次（避免 carId 冲突）
BATCH=$(date -u +%s)

# 起始时间：epoch 秒（mac 兼容）
T0_EPOCH=$BATCH

iso() {
  # $1 = seconds offset
  date -u -r $((T0_EPOCH + $1)) +"%Y-%m-%dT%H:%M:%S.000Z"
}

post () {
  local url="$1"
  local body="$2"

  echo
  echo "POST $url"
  echo "$body"

  # 打印响应 + http code
  resp=$(curl -sS -X POST "$url" \
    -H "content-type: application/json" \
    -d "$body" \
    -w "\n__HTTP__:%{http_code}\n")

  echo "$resp"

  # 检查 http code
  code=$(echo "$resp" | sed -n 's/__HTTP__:\([0-9][0-9][0-9]\)/\1/p')
  if [ "$code" -ge 400 ]; then
    echo "ERROR http=$code"
    exit 1
  fi

  # 检查业务 ok 字段（即便 http=200 也要 fail）
  if echo "$resp" | grep -q '"ok"[[:space:]]*:[[:space:]]*false'; then
    echo "ERROR: server returned ok:false"
    exit 1
  fi
}




A="b${BATCH}_carA"
B="b${BATCH}_carB"
C="b${BATCH}_carC"

# ---- carA: drive -> park S3 -> stay -> leave ----
post "$BASE/api/commands/carEnter" "{\"lotId\":\"$LOT\",\"carId\":\"$A\",\"pos\":{\"x\":10,\"y\":60},\"occurredAt\":\"$(iso 0)\"}"
post "$BASE/api/commands/carMove"  "{\"lotId\":\"$LOT\",\"carId\":\"$A\",\"from\":{\"x\":10,\"y\":60},\"to\":{\"x\":40,\"y\":60},\"occurredAt\":\"$(iso 1)\"}"
post "$BASE/api/commands/carMove"  "{\"lotId\":\"$LOT\",\"carId\":\"$A\",\"from\":{\"x\":40,\"y\":60},\"to\":{\"x\":62,\"y\":24},\"occurredAt\":\"$(iso 2)\"}"  # 贴近 S3
post "$BASE/api/commands/spotOccupy" "{\"lotId\":\"$LOT\",\"carId\":\"$A\",\"spotId\":\"S3\",\"occurredAt\":\"$(iso 3)\"}"
# 停留 8 秒
post "$BASE/api/commands/spotVacate" "{\"lotId\":\"$LOT\",\"carId\":\"$A\",\"spotId\":\"S3\",\"occurredAt\":\"$(iso 12)\"}"
post "$BASE/api/commands/carMove"  "{\"lotId\":\"$LOT\",\"carId\":\"$A\",\"from\":{\"x\":62,\"y\":24},\"to\":{\"x\":85,\"y\":60},\"occurredAt\":\"$(iso 13)\"}"
post "$BASE/api/commands/carExit"  "{\"lotId\":\"$LOT\",\"carId\":\"$A\",\"occurredAt\":\"$(iso 15)\"}"

# ---- carB: drive -> park S6 -> stay -> leave ----
post "$BASE/api/commands/carEnter" "{\"lotId\":\"$LOT\",\"carId\":\"$B\",\"pos\":{\"x\":10,\"y\":75},\"occurredAt\":\"$(iso 2)\"}"
post "$BASE/api/commands/carMove"  "{\"lotId\":\"$LOT\",\"carId\":\"$B\",\"from\":{\"x\":10,\"y\":75},\"to\":{\"x\":45,\"y\":75},\"occurredAt\":\"$(iso 4)\"}"
post "$BASE/api/commands/carMove"  "{\"lotId\":\"$LOT\",\"carId\":\"$B\",\"from\":{\"x\":45,\"y\":75},\"to\":{\"x\":44,\"y\":42},\"occurredAt\":\"$(iso 6)\"}"  # 贴近 S6
post "$BASE/api/commands/spotOccupy" "{\"lotId\":\"$LOT\",\"carId\":\"$B\",\"spotId\":\"S6\",\"occurredAt\":\"$(iso 7)\"}"
# 停留 10 秒
post "$BASE/api/commands/spotVacate" "{\"lotId\":\"$LOT\",\"carId\":\"$B\",\"spotId\":\"S6\",\"occurredAt\":\"$(iso 17)\"}"
post "$BASE/api/commands/carMove"  "{\"lotId\":\"$LOT\",\"carId\":\"$B\",\"from\":{\"x\":44,\"y\":42},\"to\":{\"x\":90,\"y\":75},\"occurredAt\":\"$(iso 18)\"}"
post "$BASE/api/commands/carExit"  "{\"lotId\":\"$LOT\",\"carId\":\"$B\",\"occurredAt\":\"$(iso 20)\"}"

# ---- carC: short visit -> park S8 -> leave ----
post "$BASE/api/commands/carEnter" "{\"lotId\":\"$LOT\",\"carId\":\"$C\",\"pos\":{\"x\":92,\"y\":75},\"occurredAt\":\"$(iso 5)\"}"
post "$BASE/api/commands/carMove"  "{\"lotId\":\"$LOT\",\"carId\":\"$C\",\"from\":{\"x\":92,\"y\":75},\"to\":{\"x\":80,\"y\":42},\"occurredAt\":\"$(iso 7)\"}"  # 贴近 S8
post "$BASE/api/commands/spotOccupy" "{\"lotId\":\"$LOT\",\"carId\":\"$C\",\"spotId\":\"S8\",\"occurredAt\":\"$(iso 8)\"}"
# 停留 4 秒
post "$BASE/api/commands/spotVacate" "{\"lotId\":\"$LOT\",\"carId\":\"$C\",\"spotId\":\"S8\",\"occurredAt\":\"$(iso 12)\"}"
post "$BASE/api/commands/carExit"  "{\"lotId\":\"$LOT\",\"carId\":\"$C\",\"occurredAt\":\"$(iso 13)\"}"

echo "Seeded parking story batch=$BATCH (A->S3, B->S6, C->S8)"
echo "Check: $BASE/api/query/events?lotId=$LOT"
