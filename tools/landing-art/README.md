# Landing page artwork

The illustrations on the website's front page (`app/public/landing/art`) are drawn by these scripts, so they can be
changed and redrawn instead of edited by hand:

```bash
python3 tools/landing-art/products.py app/public/landing/art   # p-*.svg groceries
python3 tools/landing-art/scene.py app/public/landing/art      # far, mid, shop, fg layers and the scooter
```

The phone screens in `app/public/landing/screens` are screenshots of the app at 540 px wide (WebP).
