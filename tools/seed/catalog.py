# The demo shop's product list. Run this file to write catalog.json.
# Each row: name, unit, price, mrp, stock, search words, words the database name must contain, database.
# database: food = Open Food Facts, beauty = Open Beauty Facts, products = Open Products Facts, none = drawn image.
import json

C = {}
def cat(name, rows):
    C[name] = [dict(zip(('name', 'unit', 'price', 'mrp', 'stock', 'search', 'must', 'db'), r)) for r in rows]

cat('Fruits & Vegetables', [
    ('Onion', '1 kg', 38, 45, 60, '', '', 'none'),
    ('Potato', '1 kg', 32, 40, 60, '', '', 'none'),
    ('Tomato', '1 kg', 40, 48, 40, '', '', 'none'),
    ('Banana (Robusta)', '6 pieces', 48, 55, 30, '', '', 'none'),
    ('Shimla Apple', '1 kg', 160, 190, 20, '', '', 'none'),
    ('Lemon', '250 g', 30, 35, 25, '', '', 'none'),
    ('Ginger', '250 g', 45, 55, 20, '', '', 'none'),
    ('Green Chilli', '100 g', 12, 15, 25, '', '', 'none'),
    ('Coriander Leaves', '1 bunch', 15, 20, 20, '', '', 'none'),
])
cat('Dairy, Bread & Eggs', [
    ('Amul Butter', '100 g', 58, 60, 40, 'amul butter', 'butter', 'food'),
    ('Amul Cheese Slices', '200 g', 140, 150, 20, 'amul cheese slices', 'cheese', 'food'),
    ('Amul Taaza Toned Milk', '1 litre', 74, 76, 50, 'amul taaza toned milk', 'milk', 'food'),
    ('Amul Fresh Paneer', '200 g', 90, 95, 15, 'amul paneer', 'paneer', 'food'),
    ('Mother Dairy Classic Dahi', '400 g', 50, 55, 20, 'mother dairy dahi', 'dahi', 'food'),
    ('Amul Fresh Cream', '250 ml', 68, 72, 15, 'amul fresh cream', 'cream', 'food'),
    ('Britannia Whole Wheat Bread', '400 g', 55, 60, 20, 'britannia whole wheat bread', 'bread', 'food'),
    ('Amul Cheese Spread', '200 g', 105, 110, 15, 'amul cheese spread', 'spread', 'food'),
    ('Nestle a+ Dahi', '400 g', 55, 60, 15, 'nestle dahi', 'dahi', 'food'),
    ('Farm Fresh Eggs', '6 pieces', 48, 54, 30, '', '', 'none'),
])
cat('Atta, Rice & Dal', [
    ('Aashirvaad Superior MP Atta', '5 kg', 265, 299, 25, 'aashirvaad atta', 'atta', 'food'),
    ('Fortune Chakki Fresh Atta', '5 kg', 245, 275, 20, 'fortune chakki fresh atta', 'atta', 'food'),
    ('India Gate Basmati Rice', '1 kg', 155, 180, 25, 'india gate basmati rice', 'basmati', 'food'),
    ('Daawat Rozana Basmati Rice', '1 kg', 110, 130, 25, 'daawat basmati rice', 'basmati', 'food'),
    ('Tata Sampann Toor Dal', '1 kg', 175, 199, 25, 'tata sampann toor dal', 'dal', 'food'),
    ('Tata Sampann Moong Dal', '500 g', 85, 99, 20, 'tata sampann moong dal', 'moong', 'food'),
    ('Tata Sampann Chana Dal', '1 kg', 105, 120, 20, 'tata sampann chana dal', 'chana', 'food'),
    ('Rajma Chitra', '500 g', 95, 110, 15, 'rajma', 'rajma', 'food'),
    ('Organic Tattva Kabuli Chana', '500 g', 85, 99, 15, 'kabuli chana', 'chana', 'food'),
    ('Samrat Chana Besan', '500 g', 55, 65, 20, 'besan', 'besan', 'food'),
    ('Bombay Rava (Sooji)', '500 g', 35, 42, 20, 'sooji rava', 'rava', 'food'),
    ('Poha (Flattened Rice)', '500 g', 40, 48, 20, 'poha', 'poha', 'food'),
    ('Tata Salt', '1 kg', 28, 30, 50, 'tata salt', 'salt', 'food'),
    ('Sugar', '1 kg', 46, 52, 40, 'sugar', 'sugar', 'food'),
])
cat('Oils & Ghee', [
    ('Fortune Sunlite Sunflower Oil', '1 litre', 155, 175, 25, 'fortune sunflower oil', 'oil', 'food'),
    ('Saffola Gold Oil', '1 litre', 195, 215, 20, 'saffola gold', 'saffola', 'food'),
    ('Fortune Kachi Ghani Mustard Oil', '1 litre', 175, 195, 20, 'fortune mustard oil', 'mustard', 'food'),
    ('Amul Pure Ghee', '500 ml', 315, 335, 15, 'amul ghee', 'ghee', 'food'),
    ('Patanjali Cow Ghee', '500 ml', 330, 355, 10, 'patanjali cow ghee', 'ghee', 'food'),
    ('Figaro Olive Oil', '500 ml', 499, 560, 8, 'figaro olive oil', 'olive', 'food'),
])
cat('Masala & Spices', [
    ('Everest Garam Masala', '100 g', 82, 90, 20, 'everest garam masala', 'masala', 'food'),
    ('MDH Chana Masala', '100 g', 78, 85, 20, 'mdh chana masala', 'masala', 'food'),
    ('Catch Turmeric Powder', '100 g', 38, 42, 25, 'catch turmeric powder', 'turmeric', 'food'),
    ('Everest Kashmirilal Chilli Powder', '100 g', 72, 80, 20, 'everest kashmirilal chilli', 'chilli', 'food'),
    ('MDH Kitchen King Masala', '100 g', 85, 92, 15, 'mdh kitchen king', 'kitchen king', 'food'),
    ('Catch Jeera (Cumin)', '100 g', 70, 78, 15, 'catch jeera cumin', 'cumin', 'food'),
    ('Everest Coriander Powder', '100 g', 40, 45, 20, 'everest coriander powder', 'coriander', 'food'),
    ('MDH Deggi Mirch', '100 g', 88, 95, 15, 'mdh deggi mirch', 'mirch', 'food'),
])
cat('Breakfast & Spreads', [
    ("Kellogg's Corn Flakes", '475 g', 199, 220, 15, 'kelloggs corn flakes', 'corn flakes', 'food'),
    ('Quaker Oats', '1 kg', 199, 225, 15, 'quaker oats', 'oats', 'food'),
    ('Saffola Masala Oats', '500 g', 175, 190, 15, 'saffola masala oats', 'oats', 'food'),
    ("Kellogg's Chocos", '375 g', 185, 205, 12, 'kelloggs chocos', 'chocos', 'food'),
    ('Kissan Mixed Fruit Jam', '500 g', 145, 160, 15, 'kissan mixed fruit jam', 'jam', 'food'),
    ('Cadbury Bournvita', '500 g', 225, 245, 15, 'bournvita', 'bournvita', 'food'),
    ('Horlicks Classic Malt', '500 g', 245, 265, 12, 'horlicks', 'horlicks', 'food'),
    ('Nutella Hazelnut Spread', '350 g', 365, 399, 10, 'nutella', 'nutella', 'food'),
    ('Dabur Honey Squeezy Pack', '500 g', 215, 235, 12, 'dabur honey', 'honey', 'food'),
    ('Pintola Peanut Butter', '350 g', 179, 199, 10, 'peanut butter', 'peanut', 'food'),
])
cat('Tea, Coffee & Drinks', [
    ('Tata Tea Gold', '500 g', 280, 310, 20, 'tata tea gold', 'tea', 'food'),
    ('Brooke Bond Red Label Tea', '500 g', 270, 295, 20, 'red label tea', 'tea', 'food'),
    ('Taj Mahal Tea', '250 g', 175, 190, 12, 'taj mahal tea', 'tea', 'food'),
    ('Nescafe Classic Coffee', '100 g', 315, 345, 12, 'nescafe classic', 'nescafe', 'food'),
    ('Bru Instant Coffee', '100 g', 245, 265, 12, 'bru instant coffee', 'coffee', 'food'),
    ('Tropicana Orange Juice', '1 litre', 125, 140, 12, 'tropicana orange', 'orange', 'food'),
    ('Real Fruit Power Mixed Fruit', '1 litre', 115, 130, 12, 'real mixed fruit juice', 'fruit', 'food'),
    ('Frooti Mango Drink', '600 ml', 38, 40, 30, 'frooti', 'frooti', 'food'),
    ('Maaza Mango Drink', '600 ml', 40, 42, 30, 'maaza', 'maaza', 'food'),
    ('Coca-Cola', '750 ml', 40, 42, 30, 'coca cola', 'coca', 'food'),
    ('Thums Up', '750 ml', 40, 42, 30, 'thums up', 'thums', 'food'),
    ('Sprite', '750 ml', 40, 42, 25, 'sprite', 'sprite', 'food'),
    ('Paper Boat Aamras', '250 ml', 35, 40, 20, 'paper boat aamras', 'aamras', 'food'),
    ('Bisleri Mineral Water', '1 litre', 20, 20, 60, 'bisleri', 'bisleri', 'food'),
    ('Red Bull Energy Drink', '250 ml', 125, 125, 15, 'red bull', 'red bull', 'food'),
])
cat('Biscuits & Snacks', [
    ('Parle-G Gold Biscuits', '1 kg', 135, 150, 20, 'parle g', 'parle', 'food'),
    ('Britannia Good Day Cashew', '200 g', 40, 45, 25, 'britannia good day', 'good day', 'food'),
    ('Britannia Marie Gold', '250 g', 38, 42, 25, 'britannia marie gold', 'marie', 'food'),
    ('Oreo Chocolate Cream', '120 g', 35, 40, 25, 'oreo', 'oreo', 'food'),
    ('Parle Hide & Seek', '100 g', 30, 35, 20, 'hide and seek', 'hide', 'food'),
    ('Britannia Bourbon', '150 g', 30, 35, 20, 'bourbon biscuits', 'bourbon', 'food'),
    ('Parle Monaco', '200 g', 35, 40, 20, 'monaco', 'monaco', 'food'),
    ("Lay's India's Magic Masala", '52 g', 20, 20, 40, 'lays magic masala', 'masala', 'food'),
    ('Kurkure Masala Munch', '90 g', 20, 20, 40, 'kurkure masala munch', 'kurkure', 'food'),
    ('Bingo Mad Angles Achaari Masti', '72 g', 20, 20, 30, 'bingo mad angles', 'mad angles', 'food'),
    ("Haldiram's Aloo Bhujia", '400 g', 105, 115, 20, 'haldiram aloo bhujia', 'bhujia', 'food'),
    ("Haldiram's Moong Dal", '200 g', 55, 60, 20, 'haldiram moong dal', 'moong', 'food'),
    ('Act II Butter Popcorn', '90 g', 40, 45, 15, 'act ii popcorn', 'popcorn', 'food'),
    ('Pringles Original', '107 g', 110, 120, 12, 'pringles original', 'pringles', 'food'),
])
cat('Noodles, Sauces & Ready to Eat', [
    ('Maggi 2-Minute Masala Noodles', '280 g', 56, 60, 40, 'maggi masala noodles', 'maggi', 'food'),
    ('Sunfeast YiPPee! Magic Masala', '280 g', 52, 56, 25, 'yippee noodles', 'yippee', 'food'),
    ('Top Ramen Curry Noodles', '280 g', 52, 56, 20, 'top ramen curry', 'ramen', 'food'),
    ('Kissan Fresh Tomato Ketchup', '1 kg', 145, 160, 15, 'kissan tomato ketchup', 'ketchup', 'food'),
    ('Maggi Hot & Sweet Sauce', '500 g', 130, 145, 12, 'maggi hot sweet', 'sauce', 'food'),
    ("Ching's Schezwan Chutney", '250 g', 95, 105, 12, 'chings schezwan chutney', 'schezwan', 'food'),
    ('Knorr Tomato Chatpata Cup-a-Soup', '53 g', 60, 65, 15, 'knorr tomato soup', 'soup', 'food'),
    ('MTR Ready to Eat Dal Makhani', '300 g', 115, 125, 12, 'mtr dal makhani', 'makhani', 'food'),
    ("Dr. Oetker FunFoods Veg Mayonnaise", '250 g', 95, 105, 12, 'funfoods mayonnaise', 'mayonnaise', 'food'),
    ('Del Monte Eggless Mayo', '275 g', 99, 110, 10, 'del monte mayo', 'mayo', 'food'),
])
cat('Chocolates & Sweets', [
    ('Cadbury Dairy Milk Silk', '60 g', 90, 95, 25, 'dairy milk silk', 'silk', 'food'),
    ('Cadbury Dairy Milk', '50 g', 50, 50, 30, 'cadbury dairy milk', 'dairy milk', 'food'),
    ('Nestle KitKat', '37 g', 30, 30, 30, 'kitkat', 'kitkat', 'food'),
    ('Cadbury 5 Star', '40 g', 20, 20, 30, 'cadbury 5 star', 'star', 'food'),
    ('Nestle Munch', '30 g', 10, 10, 40, 'nestle munch', 'munch', 'food'),
    ('Cadbury Perk', '28 g', 10, 10, 40, 'cadbury perk', 'perk', 'food'),
    ('Cadbury Gems', '17.8 g', 10, 10, 40, 'cadbury gems', 'gems', 'food'),
    ("Haldiram's Rasgulla", '1 kg', 199, 220, 10, 'haldiram rasgulla', 'rasgulla', 'food'),
    ('Amul Dark Chocolate', '150 g', 150, 160, 12, 'amul dark chocolate', 'dark', 'food'),
    ('Ferrero Rocher', '16 pieces', 650, 699, 6, 'ferrero rocher', 'rocher', 'food'),
])
cat('Personal Care', [
    ('Dove Cream Beauty Bathing Bar', '3 x 100 g', 189, 210, 15, 'dove beauty bar', 'dove', 'beauty'),
    ('Lux Soft Rose Soap', '4 x 100 g', 155, 170, 15, 'lux soap', 'lux', 'beauty'),
    ('Lifebuoy Total 10 Soap', '4 x 100 g', 120, 135, 20, 'lifebuoy soap', 'lifebuoy', 'beauty'),
    ('Dettol Original Soap', '3 x 125 g', 165, 180, 15, 'dettol original soap', 'dettol', 'beauty'),
    ('Colgate Strong Teeth Toothpaste', '200 g', 115, 125, 20, 'colgate strong teeth', 'colgate', 'beauty'),
    ('Pepsodent Germicheck Toothpaste', '150 g', 92, 99, 15, 'pepsodent', 'pepsodent', 'beauty'),
    ('Clinic Plus Strength & Shine Shampoo', '340 ml', 195, 215, 12, 'clinic plus shampoo', 'clinic', 'beauty'),
    ('Head & Shoulders Anti-Dandruff Shampoo', '340 ml', 375, 410, 10, 'head shoulders shampoo', 'head', 'beauty'),
    ('Parachute Coconut Oil', '500 ml', 230, 250, 15, 'parachute coconut oil', 'parachute', 'beauty'),
    ('Nivea Soft Light Moisturising Cream', '100 ml', 199, 215, 10, 'nivea soft', 'nivea', 'beauty'),
    ('Vaseline Intensive Care Lotion', '400 ml', 365, 399, 8, 'vaseline intensive care', 'vaseline', 'beauty'),
    ('Himalaya Purifying Neem Face Wash', '150 ml', 175, 190, 12, 'himalaya neem face wash', 'neem', 'beauty'),
    ('Dettol Liquid Handwash', '200 ml', 99, 109, 15, 'dettol handwash', 'dettol', 'beauty'),
    ('Gillette Guard Razor', '1 piece', 35, 40, 15, 'gillette guard', 'gillette', 'beauty'),
])
cat('Household & Cleaning', [
    ('Surf Excel Easy Wash Detergent', '1 kg', 135, 150, 15, 'surf excel', 'surf', 'products'),
    ('Ariel Matic Front Load Detergent', '1 kg', 299, 330, 10, 'ariel matic', 'ariel', 'products'),
    ('Rin Detergent Bar', '4 x 250 g', 105, 115, 15, 'rin bar', 'rin', 'products'),
    ('Vim Dishwash Bar', '3 x 155 g', 60, 66, 20, 'vim bar', 'vim', 'products'),
    ('Vim Dishwash Liquid Gel', '500 ml', 115, 125, 12, 'vim liquid', 'vim', 'products'),
    ('Harpic Power Plus Toilet Cleaner', '1 litre', 215, 235, 12, 'harpic', 'harpic', 'products'),
    ('Lizol Floor Cleaner Citrus', '975 ml', 225, 245, 10, 'lizol', 'lizol', 'products'),
    ('Colin Glass Cleaner', '500 ml', 115, 125, 10, 'colin glass cleaner', 'colin', 'products'),
    ('Good Knight Gold Flash Refill', '45 ml', 89, 95, 15, 'good knight', 'knight', 'products'),
    ('Scotch-Brite Scrub Pad', '3 pieces', 55, 60, 20, 'scotch brite', 'scotch', 'products'),
    ('Odonil Air Freshener Blocks', '4 x 50 g', 175, 190, 10, 'odonil', 'odonil', 'products'),
    ('Garbage Bags Medium', '30 bags', 99, 120, 15, '', '', 'none'),
])

if __name__ == '__main__':
    total = sum(len(v) for v in C.values())
    json.dump(C, open('catalog.base.json', 'w'), indent=1, ensure_ascii=False)
    print(total, 'products in', len(C), 'categories;', sum(1 for v in C.values() for r in v if r['db'] == 'food'), 'food')
