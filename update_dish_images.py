import base64
import json
import sys
import urllib.request
import urllib.error
from pathlib import Path

API = "https://zvme0xe9sk.execute-api.us-west-2.amazonaws.com/develop"
LOCATION_ID = "04dc2efa-aa24-460b-bff2-a691555a0afa"
IMAGE_DIR = Path("frontend/restaurant-frontend-app/src/assets/img/dishes")

FILES = {
    "Салат Цезар": "caesar-salad.jpg",
    "Брускети з томатами": "tomato-bruschetta.jpg",
    "Крем-суп грибний": "mushroom-cream-soup.jpg",
    "Паста Карбонара": "pasta-carbonara.jpg",
    "Стейк курячий": "chicken-steak.jpg",
    "Лосось з овочами": "salmon-vegetables.jpg",
    "Чізкейк": "cheesecake.jpg",
    "Тірамісу": "tiramisu.jpg",
}

def request_json(url, method="GET", payload=None):
    data = None if payload is None else json.dumps(payload, ensure_ascii=False).encode()
    req = urllib.request.Request(
        url, data=data, method=method,
      headers={"Content-Type": "application/json", "Authorization": f"Bearer {__import__('os').environ['TOKEN']}"
}
    )
    with urllib.request.urlopen(req, timeout=60) as response:
        body = response.read().decode()
        return json.loads(body) if body else {}

dishes = request_json(f"{API}/dishes")
by_name = {dish["name"]: dish for dish in dishes}

plans = []
for name, filename in FILES.items():
    dish = by_name.get(name)
    path = IMAGE_DIR / filename

    if not dish:
        raise SystemExit(f"Не знайдено страву в API: {name}")
    if not path.is_file():
        raise SystemExit(f"Не знайдено файл: {path}")

    plans.append((dish, path))

print(f"Знайдено страв: {len(plans)}")
for dish, path in plans:
    print(f'{dish["name"]}: {dish["id"]} | {path.name} | {path.stat().st_size // 1024} KB')

if "--apply" not in sys.argv:
    print("\nПеревірка завершена. Дані не змінювалися.")
    print("Для завантаження фотографій запусти: python3 update_dish_images.py --apply")
    raise SystemExit(0)

for dish, path in plans:
    image_b64 = base64.b64encode(path.read_bytes()).decode("ascii")

    payload = {
        "name": dish["name"],
        "description": dish["description"],
        "dishType": dish["dishType"],
        "price": dish["price"],
        "weight": dish["weight"],
        "calories": dish["calories"],
        "proteins": dish["proteins"],
        "fats": dish.get("Fats", dish.get("fats")),
        "carbohydrates": dish["carbohydrates"],
        "vitamins": dish["vitamins"],
        "imageBase64": "data:image/jpeg;base64," + image_b64,
        "state": dish["state"],
        "locationIds": [LOCATION_ID],
    }

    try:
        result = request_json(f'{API}/dishes/{dish["id"]}', "PUT", payload)
        print(f'OK: {dish["name"]}')
    except urllib.error.HTTPError as e:
        print(f'ПОМИЛКА {dish["name"]}: HTTP {e.code}')
        print(e.read().decode(errors="replace"))
        raise SystemExit(1)

print("\nЗавантаження всіх 8 фотографій завершено.")
