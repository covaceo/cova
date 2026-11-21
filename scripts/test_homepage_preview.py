"""Check the homepage as a link reader (no JavaScript, network or login)."""
from html.parser import HTMLParser
from pathlib import Path
import struct
import unittest
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parents[1]


class HeadMetadata(HTMLParser):
    def __init__(self):
        super().__init__()
        self.in_head = False
        self.values = {}

    def handle_starttag(self, tag, attrs):
        if tag == 'head':
            self.in_head = True
        if self.in_head and tag == 'meta':
            attrs = dict(attrs)
            key = attrs.get('property') or attrs.get('name')
            self.values.setdefault(key, []).append(attrs.get('content'))

    def handle_endtag(self, tag):
        if tag == 'head':
            self.in_head = False


class HomepagePreview(unittest.TestCase):
    def test_public_link_has_static_branded_preview(self):
        head = HeadMetadata()
        head.feed((ROOT / 'index.html').read_text(encoding='utf-8'))
        meta = head.values
        self.assertEqual(meta.get('og:title'), ['Cova'])
        self.assertEqual(meta.get('og:description'), meta['description'])
        self.assertEqual(meta.get('og:type'), ['website'])
        self.assertEqual(meta.get('og:url'), ['https://covadesk.com/'])
        self.assertEqual(meta.get('twitter:card'), ['summary'])
        self.assertEqual(len(meta['og:image']), 1)
        image = urlsplit(meta['og:image'][0])
        self.assertEqual((image.scheme, image.netloc, image.query, image.fragment),
                         ('https', 'covadesk.com', '', ''))
        icon = (ROOT / 'public' / image.path.lstrip('/')).read_bytes()
        self.assertEqual(icon[:8], b'\x89PNG\r\n\x1a\n')
        width, height = struct.unpack('>II', icon[16:24])
        self.assertEqual(meta.get('og:image:width'), [str(width)])
        self.assertEqual(meta.get('og:image:height'), [str(height)])
        self.assertTrue(meta['og:image:alt'][0].strip())


if __name__ == '__main__':
    unittest.main()
