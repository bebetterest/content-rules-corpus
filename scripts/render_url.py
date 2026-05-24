import argparse
import sys

from playwright.sync_api import sync_playwright


DEFAULT_USER_AGENT = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/125.0.0.0 Safari/537.36"
)


def main():
    parser = argparse.ArgumentParser(
        description="Render a URL with Playwright and write the rendered HTML to stdout."
    )
    parser.add_argument("url")
    parser.add_argument("--timeout-ms", type=int, default=30000)
    parser.add_argument("--wait-ms", type=int, default=6000)
    parser.add_argument("--after-click-wait-ms", type=int, default=250)
    parser.add_argument("--click-selector", action="append", default=[])
    parser.add_argument("--locale", default="en-US")
    args = parser.parse_args()

    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True)
        page = browser.new_page(locale=args.locale, user_agent=DEFAULT_USER_AGENT)
        page.goto(args.url, wait_until="domcontentloaded", timeout=args.timeout_ms)
        page.wait_for_timeout(args.wait_ms)
        for selector in args.click_selector:
            locator = page.locator(selector)
            for index in range(locator.count()):
                target = locator.nth(index)
                target.scroll_into_view_if_needed(timeout=3000)
                target.click(timeout=3000)
                page.wait_for_timeout(args.after_click_wait_ms)
        if args.click_selector:
            page.wait_for_timeout(args.wait_ms)
        html = page.content()
        browser.close()

    sys.stdout.buffer.write(html.encode("utf-8"))


if __name__ == "__main__":
    main()
