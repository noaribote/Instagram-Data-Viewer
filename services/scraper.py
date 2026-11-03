import json
import os
import re
import sys

import instaloader


PROJECT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
USERS_DIR = os.path.join(PROJECT_DIR, "model", "users")


def validate_username(username):
    clean = str(username or "").strip().removeprefix("@").strip()
    if not re.fullmatch(r"[\w.]{1,30}", clean):
        raise ValueError("Nom d’utilisateur invalide.")
    return clean


def json_path(username):
    return os.path.join(USERS_DIR, f"{validate_username(username)}.json")


def fetch_profile(username):
    """Fetch a public Instagram profile and cache its JSON in model/users/."""
    username = validate_username(username)
    os.makedirs(USERS_DIR, exist_ok=True)

    loader = instaloader.Instaloader(
        download_pictures=False,
        download_videos=False,
        save_metadata=False,
    )
    profile = instaloader.Profile.from_username(loader.context, username)
    data = dict(profile._asdict())
    actual_username = str(data.get("username") or "")
    if actual_username.casefold() != username.casefold():
        raise ValueError(
            f"Instagram a renvoyé @{actual_username or 'un autre compte'} au lieu de @{username}."
        )

    data["is_private"] = profile.is_private
    data["recent_posts"] = []

    if not profile.is_private:
        try:
            for index, post in enumerate(profile.get_posts()):
                data["recent_posts"].append(
                    {
                        "date": post.date.isoformat(),
                        "likes": post.likes,
                        "comments": post.comments,
                        "caption": post.caption,
                    }
                )
                if index >= 9:
                    break
        except Exception as error:
            data["recent_posts_error"] = str(error)

    with open(json_path(username), "w", encoding="utf-8") as output:
        json.dump(data, output, ensure_ascii=False, indent=2, default=str)

    return data


def get_profile(username, refresh=False):
    """Read cached profile data or fetch it if missing or explicitly refreshed."""
    username = validate_username(username)
    cache_path = json_path(username)

    if os.path.isfile(cache_path) and not refresh:
        with open(cache_path, encoding="utf-8") as source:
            cached = json.load(source)

        if str(cached.get("username") or "").casefold() == username.casefold():
            return cached

    return fetch_profile(username)


def find_key(obj, key):
    """Return all values associated with a key in a nested JSON structure."""
    results = []

    if isinstance(obj, dict):
        for item_key, value in obj.items():
            if item_key == key:
                results.append(value)
            results.extend(find_key(value, key))
    elif isinstance(obj, list):
        for value in obj:
            results.extend(find_key(value, key))

    return results


if __name__ == "__main__":
    try:
        profile = get_profile(sys.argv[1], refresh=True)
        print(profile.get("username", ""))
    except Exception as error:
        print(str(error), file=sys.stderr)
        sys.exit(1)
