-- Persona taxonomy v4: 214 leaves became 155 by folding garments that brands size on one table
-- into a single leaf. Chart coverage stored under a removed leaf is rewritten to the leaf it
-- folded into, de-duplicated, keeping the order each chart listed its leaves in.
--
-- The pairs below are generated from LEAF_MERGES_V4 in
-- src/modules/store/mapping/persona-taxonomy.ts and a test fails if the two ever differ.
-- Idempotent: a second run finds nothing left to convert.

with merges (old_key, new_key) as (
  values
    ('kids-boys:bottom:jean', 'kids-boys:bottom:trouser'),
    ('kids-boys:bottom:jogger', 'kids-boys:bottom:trouser'),
    ('kids-boys:footwear:sneaker', 'kids-boys:footwear:shoe'),
    ('kids-boys:full-body:all-in-one', 'kids-boys:full-body:romper'),
    ('kids-boys:outerwear:coat', 'kids-boys:outerwear:jacket'),
    ('kids-boys:outerwear:pramsuit', 'kids-boys:outerwear:snowsuit'),
    ('kids-boys:top:sweatshirt', 'kids-boys:top:hoodie'),
    ('kids-girls:bottom:jean', 'kids-girls:bottom:trouser'),
    ('kids-girls:bottom:jogger', 'kids-girls:bottom:trouser'),
    ('kids-girls:footwear:sneaker', 'kids-girls:footwear:shoe'),
    ('kids-girls:full-body:all-in-one', 'kids-girls:full-body:romper'),
    ('kids-girls:outerwear:coat', 'kids-girls:outerwear:jacket'),
    ('kids-girls:outerwear:pramsuit', 'kids-girls:outerwear:snowsuit'),
    ('kids-girls:top:blouse', 'kids-girls:top:shirt'),
    ('kids-girls:top:sweatshirt', 'kids-girls:top:hoodie'),
    ('kids-unisex:bottom:jean', 'kids-unisex:bottom:trouser'),
    ('kids-unisex:bottom:jogger', 'kids-unisex:bottom:trouser'),
    ('kids-unisex:footwear:sneaker', 'kids-unisex:footwear:shoe'),
    ('kids-unisex:full-body:all-in-one', 'kids-unisex:full-body:romper'),
    ('kids-unisex:outerwear:coat', 'kids-unisex:outerwear:jacket'),
    ('kids-unisex:outerwear:pramsuit', 'kids-unisex:outerwear:snowsuit'),
    ('kids-unisex:top:sweatshirt', 'kids-unisex:top:hoodie'),
    ('men:bottom:chino', 'men:bottom:trouser'),
    ('men:bottom:jogger', 'men:bottom:trouser'),
    ('men:footwear:espadrille', 'men:footwear:sandal'),
    ('men:footwear:loafer', 'men:footwear:dress-shoe'),
    ('men:full-body:overall', 'men:full-body:jumpsuit'),
    ('men:outerwear:coat', 'men:outerwear:jacket'),
    ('men:outerwear:gilet', 'men:outerwear:jacket'),
    ('men:outerwear:suit-jacket', 'men:outerwear:blazer'),
    ('men:top:sweater', 'men:top:knit'),
    ('men:top:sweatshirt', 'men:top:hoodie'),
    ('unisex:bottom:jogger', 'unisex:bottom:trouser'),
    ('unisex:footwear:slide', 'unisex:footwear:sandal'),
    ('unisex:full-body:overall', 'unisex:full-body:jumpsuit'),
    ('unisex:outerwear:coat', 'unisex:outerwear:jacket'),
    ('unisex:outerwear:gilet', 'unisex:outerwear:jacket'),
    ('unisex:top:sweater', 'unisex:top:knit'),
    ('unisex:top:sweatshirt', 'unisex:top:hoodie'),
    ('women:bottom:activewear-bottom', 'women:bottom:legging'),
    ('women:bottom:culotte', 'women:bottom:trouser'),
    ('women:footwear:flat', 'women:footwear:heel'),
    ('women:footwear:loafer', 'women:footwear:heel'),
    ('women:footwear:mule', 'women:footwear:heel'),
    ('women:footwear:wedge', 'women:footwear:heel'),
    ('women:full-body:abaya', 'women:full-body:kaftan'),
    ('women:full-body:gown', 'women:full-body:dress'),
    ('women:full-body:romper', 'women:full-body:jumpsuit'),
    ('women:outerwear:coat', 'women:outerwear:jacket'),
    ('women:outerwear:kimono', 'women:outerwear:jacket'),
    ('women:outerwear:trench', 'women:outerwear:jacket'),
    ('women:outerwear:vest', 'women:outerwear:jacket'),
    ('women:top:blouse', 'women:top:shirt'),
    ('women:top:bodysuit', 'women:top:t-shirt'),
    ('women:top:camisole', 'women:top:t-shirt'),
    ('women:top:crop-top', 'women:top:t-shirt'),
    ('women:top:sweater', 'women:top:knit'),
    ('women:top:sweatshirt', 'women:top:hoodie'),
    ('women:top:tank-top', 'women:top:t-shirt'),
    ('women:top:tunic', 'women:top:t-shirt')
)
update public.sizing_charts as target
set covers_leaves = converted.leaves
from (
  select id, array_agg(leaf_key order by first_position) as leaves
  from (
    select chart.id, coalesce(merge.new_key, entry.leaf) as leaf_key, min(entry.position) as first_position
    from public.sizing_charts as chart
    cross join lateral unnest(chart.covers_leaves) with ordinality as entry(leaf, position)
    left join merges as merge on merge.old_key = entry.leaf
    group by chart.id, coalesce(merge.new_key, entry.leaf)
  ) as grouped
  group by id
) as converted
where target.id = converted.id
  and target.covers_leaves is distinct from converted.leaves;

with merges (old_key, new_key) as (
  values
    ('kids-boys:bottom:jean', 'kids-boys:bottom:trouser'),
    ('kids-boys:bottom:jogger', 'kids-boys:bottom:trouser'),
    ('kids-boys:footwear:sneaker', 'kids-boys:footwear:shoe'),
    ('kids-boys:full-body:all-in-one', 'kids-boys:full-body:romper'),
    ('kids-boys:outerwear:coat', 'kids-boys:outerwear:jacket'),
    ('kids-boys:outerwear:pramsuit', 'kids-boys:outerwear:snowsuit'),
    ('kids-boys:top:sweatshirt', 'kids-boys:top:hoodie'),
    ('kids-girls:bottom:jean', 'kids-girls:bottom:trouser'),
    ('kids-girls:bottom:jogger', 'kids-girls:bottom:trouser'),
    ('kids-girls:footwear:sneaker', 'kids-girls:footwear:shoe'),
    ('kids-girls:full-body:all-in-one', 'kids-girls:full-body:romper'),
    ('kids-girls:outerwear:coat', 'kids-girls:outerwear:jacket'),
    ('kids-girls:outerwear:pramsuit', 'kids-girls:outerwear:snowsuit'),
    ('kids-girls:top:blouse', 'kids-girls:top:shirt'),
    ('kids-girls:top:sweatshirt', 'kids-girls:top:hoodie'),
    ('kids-unisex:bottom:jean', 'kids-unisex:bottom:trouser'),
    ('kids-unisex:bottom:jogger', 'kids-unisex:bottom:trouser'),
    ('kids-unisex:footwear:sneaker', 'kids-unisex:footwear:shoe'),
    ('kids-unisex:full-body:all-in-one', 'kids-unisex:full-body:romper'),
    ('kids-unisex:outerwear:coat', 'kids-unisex:outerwear:jacket'),
    ('kids-unisex:outerwear:pramsuit', 'kids-unisex:outerwear:snowsuit'),
    ('kids-unisex:top:sweatshirt', 'kids-unisex:top:hoodie'),
    ('men:bottom:chino', 'men:bottom:trouser'),
    ('men:bottom:jogger', 'men:bottom:trouser'),
    ('men:footwear:espadrille', 'men:footwear:sandal'),
    ('men:footwear:loafer', 'men:footwear:dress-shoe'),
    ('men:full-body:overall', 'men:full-body:jumpsuit'),
    ('men:outerwear:coat', 'men:outerwear:jacket'),
    ('men:outerwear:gilet', 'men:outerwear:jacket'),
    ('men:outerwear:suit-jacket', 'men:outerwear:blazer'),
    ('men:top:sweater', 'men:top:knit'),
    ('men:top:sweatshirt', 'men:top:hoodie'),
    ('unisex:bottom:jogger', 'unisex:bottom:trouser'),
    ('unisex:footwear:slide', 'unisex:footwear:sandal'),
    ('unisex:full-body:overall', 'unisex:full-body:jumpsuit'),
    ('unisex:outerwear:coat', 'unisex:outerwear:jacket'),
    ('unisex:outerwear:gilet', 'unisex:outerwear:jacket'),
    ('unisex:top:sweater', 'unisex:top:knit'),
    ('unisex:top:sweatshirt', 'unisex:top:hoodie'),
    ('women:bottom:activewear-bottom', 'women:bottom:legging'),
    ('women:bottom:culotte', 'women:bottom:trouser'),
    ('women:footwear:flat', 'women:footwear:heel'),
    ('women:footwear:loafer', 'women:footwear:heel'),
    ('women:footwear:mule', 'women:footwear:heel'),
    ('women:footwear:wedge', 'women:footwear:heel'),
    ('women:full-body:abaya', 'women:full-body:kaftan'),
    ('women:full-body:gown', 'women:full-body:dress'),
    ('women:full-body:romper', 'women:full-body:jumpsuit'),
    ('women:outerwear:coat', 'women:outerwear:jacket'),
    ('women:outerwear:kimono', 'women:outerwear:jacket'),
    ('women:outerwear:trench', 'women:outerwear:jacket'),
    ('women:outerwear:vest', 'women:outerwear:jacket'),
    ('women:top:blouse', 'women:top:shirt'),
    ('women:top:bodysuit', 'women:top:t-shirt'),
    ('women:top:camisole', 'women:top:t-shirt'),
    ('women:top:crop-top', 'women:top:t-shirt'),
    ('women:top:sweater', 'women:top:knit'),
    ('women:top:sweatshirt', 'women:top:hoodie'),
    ('women:top:tank-top', 'women:top:t-shirt'),
    ('women:top:tunic', 'women:top:t-shirt')
)
update public.sizing_charts_private as target
set covers_leaves = converted.leaves
from (
  select id, array_agg(leaf_key order by first_position) as leaves
  from (
    select chart.id, coalesce(merge.new_key, entry.leaf) as leaf_key, min(entry.position) as first_position
    from public.sizing_charts_private as chart
    cross join lateral unnest(chart.covers_leaves) with ordinality as entry(leaf, position)
    left join merges as merge on merge.old_key = entry.leaf
    group by chart.id, coalesce(merge.new_key, entry.leaf)
  ) as grouped
  group by id
) as converted
where target.id = converted.id
  and target.covers_leaves is distinct from converted.leaves;
