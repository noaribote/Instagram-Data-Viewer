from __future__ import annotations
import argparse
import mimetypes
import os
import re
import sys
import time
from pathlib import Path
from urllib.parse import parse_qs, unquote, urlparse
from playwright.sync_api import TimeoutError as PlaywrightTimeoutError
from playwright.sync_api import sync_playwright
SITE = "https://storiesig.info"


def find_edge() -> Path | None:
    candidates = [
        Path(os.environ.get("PROGRAMFILES(X86)", r"C:\Program Files (x86)")) / "Microsoft/Edge/Application/msedge.exe",
        Path(os.environ.get("PROGRAMFILES", r"C:\Program Files")) / "Microsoft/Edge/Application/msedge.exe",
        Path(os.environ.get("LOCALAPPDATA", "")) / "Microsoft/Edge/Application/msedge.exe",
    ]
    for candidate in candidates:
        if candidate.is_file():
            return candidate
    return None


def safe_name(value: str) -> str:
    value = unquote(value).strip()
    value = re.sub(r"[<>:\"/\\|?*\x00-\x1f]", "_", value)
    value = re.sub(r"\s+", "_", value).strip("._")
    return value[:100] or "profil"


def filename_for(url: str, content_type: str | None, index: int) -> str:
    parsed = urlparse(url)
    query_name = parse_qs(parsed.query).get("filename", [""])[0]
    path_name = query_name or unquote(Path(parsed.path).name)
    if path_name and Path(path_name).suffix:
        name = safe_name(path_name)
    else:
        mime = (content_type or "").split(";", 1)[0].strip().lower()
        ext = mimetypes.guess_extension(mime) or ".bin"
        if ext == ".jpe":
            ext = ".jpg"
        name = f"media_{index:03d}{ext}"
    return name


def unique_path(folder: Path, name: str) -> Path:
    candidate = folder / name
    stem, suffix = candidate.stem, candidate.suffix
    counter = 1
    while candidate.exists():
        candidate = folder / f"{stem}_{counter}{suffix}"
        counter += 1
    return candidate


def wait_for_media_to_settle(page, selector: str, timeout: int, *, minimum_wait: float = 3.0) -> list[str]:
    deadline = time.monotonic() + timeout
    started = time.monotonic()
    stable_since = started
    previous_hrefs: tuple[str, ...] | None = None
    while time.monotonic() < deadline:
        hrefs = tuple(page.locator(selector).evaluate_all(
            "els => els.map(el => el.href).filter(Boolean)"
        ))
        if hrefs != previous_hrefs:
            previous_hrefs = hrefs
            stable_since = time.monotonic()
        elif time.monotonic() - stable_since >= 3 and time.monotonic() - started >= minimum_wait:
            return list(hrefs)
        time.sleep(0.5)
    return list(previous_hrefs or ())


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Envoie un nom de profil à StoriesIG et télécharge les médias visibles."
    )
    parser.add_argument("profil", nargs="?", help="@username ou lien de profil Instagram")
    parser.add_argument("-o", "--output", type=Path, default=Path("telechargements"),
                        help="dossier de sortie (défaut : ./telechargements)")
    parser.add_argument("--visible", action="store_true", help="afficher le navigateur pendant l'exécution")
    parser.add_argument("--timeout", type=int, default=90,
                        help="secondes d'attente des résultats (défaut : 90)")
    args = parser.parse_args()

    query = args.profil or input("@username ou lien Instagram : ").strip()
    if not query:
        print(f"@BOT./$ Aucun profil fourni.", file=sys.stderr)
        return 2

    args.output.mkdir(parents=True, exist_ok=True)
    profile_folder = args.output / safe_name(query.lstrip("@"))
    profile_folder.mkdir(parents=True, exist_ok=True)

    with sync_playwright() as p:
        edge_path = find_edge()
        if edge_path:
            browser = p.chromium.launch(executable_path=str(edge_path), headless=not args.visible)
        else:
            try:
                browser = p.chromium.launch(headless=not args.visible)
            except Exception as exc:
                print(
                    "Aucun navigateur compatible trouvé. Installe Edge ou Chromium avec :\n"
                    "  python -m playwright install chromium\n\n"
                    f"Détail : {exc}",
                    file=sys.stderr,
                )
                return 1
        context = browser.new_context(accept_downloads=True)
        page = context.new_page()
        try:
            print(f"@BOT./$ Infiltration dans Instagram…")
            page.goto(SITE, wait_until="domcontentloaded", timeout=args.timeout * 1000)
            search = page.locator('input.search-form__input, input.search[placeholder="@username or link"]').first
            search.wait_for(state="visible", timeout=args.timeout * 1000)
            search.fill(query)

            button = page.locator("button.search-form__button").first
            if button.count():
                button.click()
            else:
                search.press("Enter")

            print(f"@BOT./$ Recherche lancée ; attente du chargement du profil…")
            tabs = page.locator("button.tabs-component__button")
            try:
                tabs.first.wait_for(state="visible", timeout=args.timeout * 1000)
            except PlaywrightTimeoutError:
                print(f"@BOT./$ Délai expiré ; veuillez réessayer ultérieurement.")
                return 1
            page.wait_for_timeout(2000)

            print(f"@BOT./$ Profil chargé. Collecte des Stories et Highlights…")
            all_media: list[tuple[str, str]] = []
            download_selector = (
                'ul.profile-media-list a.download-btn[href], '
                'ul.profile-media-list a.button__download[href]'
            )

            stories_tab = page.locator("button.tabs-component__button").filter(
                has_text=re.compile(r"^stories$", re.IGNORECASE)
            ).first
            if stories_tab.count():
                stories_tab.click()
                print(f"@BOT./$ Stories : attente pour cellecte…")
                story_urls = wait_for_media_to_settle(
                    page, download_selector, args.timeout, minimum_wait=5.0
                )
                print(f"@BOT./$ Stories : {len(story_urls)} média(s).")
                all_media.extend(("stories", url) for url in story_urls)
            else:
                print(f"@BOT./$ « stories » introuvable.")

            highlights_tab = page.locator("button.tabs-component__button").filter(
                has_text=re.compile(r"^highlights$", re.IGNORECASE)
            ).first
            if highlights_tab.count():
                highlights_tab.click()
                print(f"@BOT./$ Highlights : attente de la liste…")
                highlights_list = page.locator("ul.highlights-component")
                try:
                    highlights_list.wait_for(state="visible", timeout=args.timeout * 1000)
                    page.wait_for_timeout(2500)
                except PlaywrightTimeoutError:
                    print(f"@BOT./$ <ul.highlights-component> n'est pas apparue.")

                highlight_buttons = page.locator("ul.highlights-component .highlight__button")
                button_count = highlight_buttons.count()
                print(f"@BOT./$ Highlights : {button_count} à la une trouvé(s).")
                highlight_urls = []
                for index in range(button_count):
                    current_button = page.locator(
                        "ul.highlights-component .highlight__button"
                    ).nth(index)
                    try:
                        current_button.click(timeout=5000)
                    except PlaywrightTimeoutError:
                        print(f"@BOT./$ Impossible d'accéder au highlight {index + 1}/{button_count}.")
                        continue

                    print(f"@BOT./$ Highlight {index + 1}/{button_count} : attente des médias…")
                    found = wait_for_media_to_settle(
                        page, download_selector, args.timeout, minimum_wait=4.0
                    )
                    for url in found:
                        if url not in highlight_urls:
                            highlight_urls.append(url)

                print(f"@BOT./$ Highlights : {len(highlight_urls)} média(s) au total.")
                all_media.extend(("highlights", url) for url in highlight_urls)
            else:
                print(f"@BOT./$ « highlights » introuvable.")

            if not all_media:
                print(f"Aucun contenu trouvé sur le compte de @{query}.")
                return 1

            print(f"@BOT./$ Téléchargement dans : {profile_folder.resolve()}")
            downloaded = 0
            for index, (category, url) in enumerate(all_media, 1):
                try:
                    response = context.request.get(url, timeout=args.timeout * 1000)
                    if not response.ok:
                        print(f"@BOT./$ [{index}/{len(all_media)}] HTTP {response.status} : {url}")
                        continue
                    data = response.body()
                    if not data:
                        print(f"@BOT./$ [{index}/{len(all_media)}] Fichier vide : {url}")
                        continue
                    name = filename_for(url, response.headers.get("content-type"), index)
                    category_folder = profile_folder / category
                    category_folder.mkdir(parents=True, exist_ok=True)
                    destination = unique_path(category_folder, name)
                    destination.write_bytes(data)
                    print(f"@BOT./$ [{index}/{len(all_media)}] [{category}] {destination.name} ({len(data):,} octets)")
                    downloaded += 1
                except Exception as exc:
                    print(f"@BOT./$ [{index}/{len(all_media)}] Échec pour {url} : {exc}")

            print(f"Terminé : {downloaded}/{len(all_media)} média(s) téléchargé(s).")
            return 0 if downloaded else 1
        except PlaywrightTimeoutError as exc:
            print(f"@BOT./$ Délai dépassé en attendant StoriesIG ou ses résultats : {exc}", file=sys.stderr)
            return 1
        finally:
            context.close()
            browser.close()


if __name__ == "__main__":
    raise SystemExit(main())
