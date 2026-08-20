// Industrial color standards — RAL Classic
// Source: RAL gGmbH standard color chart

export interface RalColor {
  code: string;       // "RAL 1000"
  hex: string;        // "#BEBD7F"
  name_en: string;
  name_es: string;
}

export const RAL_CLASSIC: RalColor[] = [
  // ── Yellows (1xxx) ──
  { code: 'RAL 1000', hex: '#BEBD7F', name_en: 'Green Beige', name_es: 'Beige verdoso' },
  { code: 'RAL 1001', hex: '#C2B078', name_en: 'Beige', name_es: 'Beige' },
  { code: 'RAL 1002', hex: '#C6A961', name_en: 'Sand Yellow', name_es: 'Amarillo arena' },
  { code: 'RAL 1003', hex: '#E5BE01', name_en: 'Signal Yellow', name_es: 'Amarillo señales' },
  { code: 'RAL 1004', hex: '#CDA434', name_en: 'Golden Yellow', name_es: 'Amarillo oro' },
  { code: 'RAL 1005', hex: '#A98307', name_en: 'Honey Yellow', name_es: 'Amarillo miel' },
  { code: 'RAL 1006', hex: '#E4A010', name_en: 'Maize Yellow', name_es: 'Amarillo maíz' },
  { code: 'RAL 1007', hex: '#DC9D00', name_en: 'Daffodil Yellow', name_es: 'Amarillo narciso' },
  { code: 'RAL 1011', hex: '#8A6642', name_en: 'Brown Beige', name_es: 'Beige pardo' },
  { code: 'RAL 1012', hex: '#C7B446', name_en: 'Lemon Yellow', name_es: 'Amarillo limón' },
  { code: 'RAL 1013', hex: '#EAE6CA', name_en: 'Oyster White', name_es: 'Blanco perla' },
  { code: 'RAL 1014', hex: '#E1CC4F', name_en: 'Ivory', name_es: 'Marfil' },
  { code: 'RAL 1015', hex: '#E6D690', name_en: 'Light Ivory', name_es: 'Marfil claro' },
  { code: 'RAL 1016', hex: '#EDFF21', name_en: 'Sulfur Yellow', name_es: 'Amarillo azufre' },
  { code: 'RAL 1017', hex: '#F5D033', name_en: 'Saffron Yellow', name_es: 'Amarillo azafrán' },
  { code: 'RAL 1018', hex: '#F8F32B', name_en: 'Zinc Yellow', name_es: 'Amarillo zinc' },
  { code: 'RAL 1019', hex: '#9E9764', name_en: 'Grey Beige', name_es: 'Beige agrisado' },
  { code: 'RAL 1020', hex: '#999950', name_en: 'Olive Yellow', name_es: 'Amarillo oliva' },
  { code: 'RAL 1021', hex: '#F3DA0B', name_en: 'Colza Yellow', name_es: 'Amarillo colza' },
  { code: 'RAL 1023', hex: '#FAD201', name_en: 'Traffic Yellow', name_es: 'Amarillo tráfico' },
  { code: 'RAL 1024', hex: '#AEA04B', name_en: 'Ochre Yellow', name_es: 'Amarillo ocre' },
  { code: 'RAL 1026', hex: '#FFFF00', name_en: 'Luminous Yellow', name_es: 'Amarillo luminoso' },
  { code: 'RAL 1027', hex: '#9D9101', name_en: 'Curry', name_es: 'Amarillo curry' },
  { code: 'RAL 1028', hex: '#F4A900', name_en: 'Melon Yellow', name_es: 'Amarillo melón' },
  { code: 'RAL 1032', hex: '#D6AE01', name_en: 'Broom Yellow', name_es: 'Amarillo retama' },
  { code: 'RAL 1033', hex: '#F3A505', name_en: 'Dahlia Yellow', name_es: 'Amarillo dalia' },
  { code: 'RAL 1034', hex: '#EFA94A', name_en: 'Pastel Yellow', name_es: 'Amarillo pastel' },
  { code: 'RAL 1035', hex: '#6A5D4D', name_en: 'Pearl Beige', name_es: 'Beige perlado' },
  { code: 'RAL 1036', hex: '#705335', name_en: 'Pearl Gold', name_es: 'Oro perlado' },
  { code: 'RAL 1037', hex: '#F39F18', name_en: 'Sun Yellow', name_es: 'Amarillo sol' },

  // ── Oranges (2xxx) ──
  { code: 'RAL 2000', hex: '#ED760E', name_en: 'Yellow Orange', name_es: 'Naranja amarillento' },
  { code: 'RAL 2001', hex: '#C93C20', name_en: 'Red Orange', name_es: 'Naranja rojizo' },
  { code: 'RAL 2002', hex: '#CB2821', name_en: 'Vermilion', name_es: 'Naranja sanguíneo' },
  { code: 'RAL 2003', hex: '#FF7514', name_en: 'Pastel Orange', name_es: 'Naranja pastel' },
  { code: 'RAL 2004', hex: '#F44611', name_en: 'Pure Orange', name_es: 'Naranja puro' },
  { code: 'RAL 2005', hex: '#FF2301', name_en: 'Luminous Orange', name_es: 'Naranja luminoso' },
  { code: 'RAL 2007', hex: '#FFB200', name_en: 'Luminous Bright Orange', name_es: 'Naranja brillante luminoso' },
  { code: 'RAL 2008', hex: '#F75E25', name_en: 'Bright Red Orange', name_es: 'Rojo naranja claro' },
  { code: 'RAL 2009', hex: '#F54021', name_en: 'Traffic Orange', name_es: 'Naranja tráfico' },
  { code: 'RAL 2010', hex: '#D84B20', name_en: 'Signal Orange', name_es: 'Naranja señales' },
  { code: 'RAL 2011', hex: '#EC7C26', name_en: 'Deep Orange', name_es: 'Naranja intenso' },
  { code: 'RAL 2012', hex: '#E55137', name_en: 'Salmon Orange', name_es: 'Naranja salmón' },
  { code: 'RAL 2013', hex: '#C35831', name_en: 'Pearl Orange', name_es: 'Naranja perlado' },

  // ── Reds (3xxx) ──
  { code: 'RAL 3000', hex: '#AF2B1E', name_en: 'Flame Red', name_es: 'Rojo vivo' },
  { code: 'RAL 3001', hex: '#A52019', name_en: 'Signal Red', name_es: 'Rojo señales' },
  { code: 'RAL 3002', hex: '#A2231D', name_en: 'Carmine Red', name_es: 'Rojo carmín' },
  { code: 'RAL 3003', hex: '#9B111E', name_en: 'Ruby Red', name_es: 'Rojo rubí' },
  { code: 'RAL 3004', hex: '#75151E', name_en: 'Purple Red', name_es: 'Rojo púrpura' },
  { code: 'RAL 3005', hex: '#5E2129', name_en: 'Wine Red', name_es: 'Rojo vino' },
  { code: 'RAL 3007', hex: '#412227', name_en: 'Black Red', name_es: 'Rojo negruzco' },
  { code: 'RAL 3009', hex: '#642424', name_en: 'Oxide Red', name_es: 'Rojo óxido' },
  { code: 'RAL 3011', hex: '#781F19', name_en: 'Brown Red', name_es: 'Rojo pardo' },
  { code: 'RAL 3012', hex: '#C1876B', name_en: 'Beige Red', name_es: 'Rojo beige' },
  { code: 'RAL 3013', hex: '#A12312', name_en: 'Tomato Red', name_es: 'Rojo tomate' },
  { code: 'RAL 3014', hex: '#D36E70', name_en: 'Antique Pink', name_es: 'Rosa viejo' },
  { code: 'RAL 3015', hex: '#EA899A', name_en: 'Light Pink', name_es: 'Rosa claro' },
  { code: 'RAL 3016', hex: '#B32821', name_en: 'Coral Red', name_es: 'Rojo coral' },
  { code: 'RAL 3017', hex: '#E63244', name_en: 'Rose', name_es: 'Rosa' },
  { code: 'RAL 3018', hex: '#D53032', name_en: 'Strawberry Red', name_es: 'Rojo fresa' },
  { code: 'RAL 3020', hex: '#CC0605', name_en: 'Traffic Red', name_es: 'Rojo tráfico' },
  { code: 'RAL 3022', hex: '#D95030', name_en: 'Salmon Pink', name_es: 'Rosa salmón' },
  { code: 'RAL 3024', hex: '#F80000', name_en: 'Luminous Red', name_es: 'Rojo luminoso' },
  { code: 'RAL 3026', hex: '#FE0000', name_en: 'Luminous Bright Red', name_es: 'Rojo luminoso brillante' },
  { code: 'RAL 3027', hex: '#C51D34', name_en: 'Raspberry Red', name_es: 'Rojo frambuesa' },
  { code: 'RAL 3028', hex: '#CB3234', name_en: 'Pure Red', name_es: 'Rojo puro' },
  { code: 'RAL 3031', hex: '#B32428', name_en: 'Orient Red', name_es: 'Rojo oriental' },
  { code: 'RAL 3032', hex: '#721422', name_en: 'Pearl Ruby Red', name_es: 'Rojo rubí perlado' },
  { code: 'RAL 3033', hex: '#B44C43', name_en: 'Pearl Pink', name_es: 'Rosa perlado' },

  // ── Violets (4xxx) ──
  { code: 'RAL 4001', hex: '#6D3461', name_en: 'Red Lilac', name_es: 'Lila rojizo' },
  { code: 'RAL 4002', hex: '#922B3E', name_en: 'Red Violet', name_es: 'Violeta rojizo' },
  { code: 'RAL 4003', hex: '#DE4C8A', name_en: 'Heather Violet', name_es: 'Violeta érica' },
  { code: 'RAL 4004', hex: '#641C34', name_en: 'Claret Violet', name_es: 'Burdeos' },
  { code: 'RAL 4005', hex: '#6C4675', name_en: 'Blue Lilac', name_es: 'Lila azulado' },
  { code: 'RAL 4006', hex: '#A5195D', name_en: 'Traffic Purple', name_es: 'Púrpura tráfico' },
  { code: 'RAL 4007', hex: '#4A192C', name_en: 'Purple Violet', name_es: 'Violeta púrpura' },
  { code: 'RAL 4008', hex: '#924E7D', name_en: 'Signal Violet', name_es: 'Violeta señales' },
  { code: 'RAL 4009', hex: '#A18594', name_en: 'Pastel Violet', name_es: 'Violeta pastel' },
  { code: 'RAL 4010', hex: '#CF3476', name_en: 'Telemagenta', name_es: 'Telemagenta' },
  { code: 'RAL 4011', hex: '#8673A1', name_en: 'Pearl Violet', name_es: 'Violeta perlado' },
  { code: 'RAL 4012', hex: '#6C6874', name_en: 'Pearl Blackberry', name_es: 'Mora perlado' },

  // ── Blues (5xxx) ──
  { code: 'RAL 5000', hex: '#354D73', name_en: 'Violet Blue', name_es: 'Azul violeta' },
  { code: 'RAL 5001', hex: '#1F3438', name_en: 'Green Blue', name_es: 'Azul verdoso' },
  { code: 'RAL 5002', hex: '#20214F', name_en: 'Ultramarine Blue', name_es: 'Azul ultramar' },
  { code: 'RAL 5003', hex: '#1D1E33', name_en: 'Sapphire Blue', name_es: 'Azul zafiro' },
  { code: 'RAL 5004', hex: '#18171C', name_en: 'Black Blue', name_es: 'Azul negruzco' },
  { code: 'RAL 5005', hex: '#1E2460', name_en: 'Signal Blue', name_es: 'Azul señales' },
  { code: 'RAL 5007', hex: '#3E5F8A', name_en: 'Brilliant Blue', name_es: 'Azul brillante' },
  { code: 'RAL 5008', hex: '#26252D', name_en: 'Grey Blue', name_es: 'Azul grisáceo' },
  { code: 'RAL 5009', hex: '#025669', name_en: 'Azure Blue', name_es: 'Azul celeste' },
  { code: 'RAL 5010', hex: '#0E294B', name_en: 'Gentian Blue', name_es: 'Azul genciana' },
  { code: 'RAL 5011', hex: '#231A24', name_en: 'Steel Blue', name_es: 'Azul acero' },
  { code: 'RAL 5012', hex: '#3B83BD', name_en: 'Light Blue', name_es: 'Azul claro' },
  { code: 'RAL 5013', hex: '#1E213D', name_en: 'Cobalt Blue', name_es: 'Azul cobalto' },
  { code: 'RAL 5014', hex: '#606E8C', name_en: 'Pigeon Blue', name_es: 'Azul paloma' },
  { code: 'RAL 5015', hex: '#2271B3', name_en: 'Sky Blue', name_es: 'Azul celeste' },
  { code: 'RAL 5017', hex: '#063971', name_en: 'Traffic Blue', name_es: 'Azul tráfico' },
  { code: 'RAL 5018', hex: '#3F888F', name_en: 'Turquoise Blue', name_es: 'Azul turquesa' },
  { code: 'RAL 5019', hex: '#1B5583', name_en: 'Capri Blue', name_es: 'Azul capri' },
  { code: 'RAL 5020', hex: '#1D334A', name_en: 'Ocean Blue', name_es: 'Azul océano' },
  { code: 'RAL 5021', hex: '#256D7B', name_en: 'Water Blue', name_es: 'Azul agua' },
  { code: 'RAL 5022', hex: '#252850', name_en: 'Night Blue', name_es: 'Azul noche' },
  { code: 'RAL 5023', hex: '#49678D', name_en: 'Distant Blue', name_es: 'Azul lejanía' },
  { code: 'RAL 5024', hex: '#5D9B9B', name_en: 'Pastel Blue', name_es: 'Azul pastel' },
  { code: 'RAL 5025', hex: '#2A6478', name_en: 'Pearl Gentian Blue', name_es: 'Azul genciana perlado' },
  { code: 'RAL 5026', hex: '#102C54', name_en: 'Pearl Night Blue', name_es: 'Azul noche perlado' },

  // ── Greens (6xxx) ──
  { code: 'RAL 6000', hex: '#316650', name_en: 'Patina Green', name_es: 'Verde pátina' },
  { code: 'RAL 6001', hex: '#287233', name_en: 'Emerald Green', name_es: 'Verde esmeralda' },
  { code: 'RAL 6002', hex: '#2D572C', name_en: 'Leaf Green', name_es: 'Verde hoja' },
  { code: 'RAL 6003', hex: '#424632', name_en: 'Olive Green', name_es: 'Verde oliva' },
  { code: 'RAL 6004', hex: '#1F3A3D', name_en: 'Blue Green', name_es: 'Verde azulado' },
  { code: 'RAL 6005', hex: '#2F4538', name_en: 'Moss Green', name_es: 'Verde musgo' },
  { code: 'RAL 6006', hex: '#3E3B32', name_en: 'Grey Olive', name_es: 'Oliva grisáceo' },
  { code: 'RAL 6007', hex: '#343B29', name_en: 'Bottle Green', name_es: 'Verde botella' },
  { code: 'RAL 6008', hex: '#39352A', name_en: 'Brown Green', name_es: 'Verde parduzco' },
  { code: 'RAL 6009', hex: '#31372B', name_en: 'Fir Green', name_es: 'Verde abeto' },
  { code: 'RAL 6010', hex: '#35682D', name_en: 'Grass Green', name_es: 'Verde hierba' },
  { code: 'RAL 6011', hex: '#587246', name_en: 'Reseda Green', name_es: 'Verde reseda' },
  { code: 'RAL 6012', hex: '#343E40', name_en: 'Black Green', name_es: 'Verde negruzco' },
  { code: 'RAL 6013', hex: '#6C7156', name_en: 'Reed Green', name_es: 'Verde caña' },
  { code: 'RAL 6014', hex: '#47402E', name_en: 'Yellow Olive', name_es: 'Oliva amarillento' },
  { code: 'RAL 6015', hex: '#3B3C36', name_en: 'Black Olive', name_es: 'Oliva negruzco' },
  { code: 'RAL 6016', hex: '#1E5945', name_en: 'Turquoise Green', name_es: 'Verde turquesa' },
  { code: 'RAL 6017', hex: '#4C9141', name_en: 'May Green', name_es: 'Verde mayo' },
  { code: 'RAL 6018', hex: '#57A639', name_en: 'Yellow Green', name_es: 'Verde amarillento' },
  { code: 'RAL 6019', hex: '#BDECB6', name_en: 'Pastel Green', name_es: 'Verde pastel' },
  { code: 'RAL 6020', hex: '#2E3A23', name_en: 'Chrome Green', name_es: 'Verde cromo' },
  { code: 'RAL 6021', hex: '#89AC76', name_en: 'Pale Green', name_es: 'Verde pálido' },
  { code: 'RAL 6022', hex: '#25221B', name_en: 'Olive Drab', name_es: 'Oliva parduzco' },
  { code: 'RAL 6024', hex: '#308446', name_en: 'Traffic Green', name_es: 'Verde tráfico' },
  { code: 'RAL 6025', hex: '#3D642D', name_en: 'Fern Green', name_es: 'Verde helecho' },
  { code: 'RAL 6026', hex: '#015D52', name_en: 'Opal Green', name_es: 'Verde ópalo' },
  { code: 'RAL 6027', hex: '#84C3BE', name_en: 'Light Green', name_es: 'Verde claro' },
  { code: 'RAL 6028', hex: '#2C5545', name_en: 'Pine Green', name_es: 'Verde pino' },
  { code: 'RAL 6029', hex: '#20603D', name_en: 'Mint Green', name_es: 'Verde menta' },
  { code: 'RAL 6032', hex: '#317F43', name_en: 'Signal Green', name_es: 'Verde señales' },
  { code: 'RAL 6033', hex: '#497E76', name_en: 'Mint Turquoise', name_es: 'Turquesa menta' },
  { code: 'RAL 6034', hex: '#7FB5B5', name_en: 'Pastel Turquoise', name_es: 'Turquesa pastel' },
  { code: 'RAL 6035', hex: '#1C542D', name_en: 'Pearl Green', name_es: 'Verde perlado' },
  { code: 'RAL 6036', hex: '#193737', name_en: 'Pearl Opal Green', name_es: 'Verde ópalo perlado' },
  { code: 'RAL 6037', hex: '#008F39', name_en: 'Pure Green', name_es: 'Verde puro' },
  { code: 'RAL 6038', hex: '#00BB2D', name_en: 'Luminous Green', name_es: 'Verde luminoso' },

  // ── Greys (7xxx) ──
  { code: 'RAL 7000', hex: '#78858B', name_en: 'Squirrel Grey', name_es: 'Gris ardilla' },
  { code: 'RAL 7001', hex: '#8A9597', name_en: 'Silver Grey', name_es: 'Gris plata' },
  { code: 'RAL 7002', hex: '#7E7B52', name_en: 'Olive Grey', name_es: 'Gris oliva' },
  { code: 'RAL 7003', hex: '#6C7059', name_en: 'Moss Grey', name_es: 'Gris musgo' },
  { code: 'RAL 7004', hex: '#969992', name_en: 'Signal Grey', name_es: 'Gris señales' },
  { code: 'RAL 7005', hex: '#646B63', name_en: 'Mouse Grey', name_es: 'Gris ratón' },
  { code: 'RAL 7006', hex: '#6D6552', name_en: 'Beige Grey', name_es: 'Gris beige' },
  { code: 'RAL 7008', hex: '#6A5F31', name_en: 'Khaki Grey', name_es: 'Gris caqui' },
  { code: 'RAL 7009', hex: '#4D5645', name_en: 'Green Grey', name_es: 'Gris verdoso' },
  { code: 'RAL 7010', hex: '#4C514A', name_en: 'Tarpaulin Grey', name_es: 'Gris lona' },
  { code: 'RAL 7011', hex: '#434B4D', name_en: 'Iron Grey', name_es: 'Gris hierro' },
  { code: 'RAL 7012', hex: '#4E5754', name_en: 'Basalt Grey', name_es: 'Gris basalto' },
  { code: 'RAL 7013', hex: '#464531', name_en: 'Brown Grey', name_es: 'Gris parduzco' },
  { code: 'RAL 7015', hex: '#434750', name_en: 'Slate Grey', name_es: 'Gris pizarra' },
  { code: 'RAL 7016', hex: '#293133', name_en: 'Anthracite Grey', name_es: 'Gris antracita' },
  { code: 'RAL 7021', hex: '#23282B', name_en: 'Black Grey', name_es: 'Gris negruzco' },
  { code: 'RAL 7022', hex: '#332F2C', name_en: 'Umbra Grey', name_es: 'Gris sombra' },
  { code: 'RAL 7023', hex: '#686C5E', name_en: 'Concrete Grey', name_es: 'Gris hormigón' },
  { code: 'RAL 7024', hex: '#474A51', name_en: 'Graphite Grey', name_es: 'Gris grafita' },
  { code: 'RAL 7026', hex: '#2F353B', name_en: 'Granite Grey', name_es: 'Gris granito' },
  { code: 'RAL 7030', hex: '#8B8C7A', name_en: 'Stone Grey', name_es: 'Gris piedra' },
  { code: 'RAL 7031', hex: '#474B4E', name_en: 'Blue Grey', name_es: 'Gris azulado' },
  { code: 'RAL 7032', hex: '#B8B799', name_en: 'Pebble Grey', name_es: 'Gris guijarro' },
  { code: 'RAL 7033', hex: '#7D8471', name_en: 'Cement Grey', name_es: 'Gris cemento' },
  { code: 'RAL 7034', hex: '#8F8B66', name_en: 'Yellow Grey', name_es: 'Gris amarillento' },
  { code: 'RAL 7035', hex: '#D7D7D7', name_en: 'Light Grey', name_es: 'Gris claro' },
  { code: 'RAL 7036', hex: '#7F7679', name_en: 'Platinum Grey', name_es: 'Gris platino' },
  { code: 'RAL 7037', hex: '#7D7F7D', name_en: 'Dusty Grey', name_es: 'Gris polvo' },
  { code: 'RAL 7038', hex: '#B5B8B1', name_en: 'Agate Grey', name_es: 'Gris ágata' },
  { code: 'RAL 7039', hex: '#6C6960', name_en: 'Quartz Grey', name_es: 'Gris cuarzo' },
  { code: 'RAL 7040', hex: '#9DA1AA', name_en: 'Window Grey', name_es: 'Gris ventana' },
  { code: 'RAL 7042', hex: '#8D948D', name_en: 'Traffic Grey A', name_es: 'Gris tráfico A' },
  { code: 'RAL 7043', hex: '#4E5452', name_en: 'Traffic Grey B', name_es: 'Gris tráfico B' },
  { code: 'RAL 7044', hex: '#CAC4B0', name_en: 'Silk Grey', name_es: 'Gris seda' },
  { code: 'RAL 7045', hex: '#909090', name_en: 'Telegrey 1', name_es: 'Telegris 1' },
  { code: 'RAL 7046', hex: '#82898F', name_en: 'Telegrey 2', name_es: 'Telegris 2' },
  { code: 'RAL 7047', hex: '#D0D0D0', name_en: 'Telegrey 4', name_es: 'Telegris 4' },
  { code: 'RAL 7048', hex: '#898176', name_en: 'Pearl Mouse Grey', name_es: 'Gris ratón perlado' },

  // ── Browns (8xxx) ──
  { code: 'RAL 8000', hex: '#826C34', name_en: 'Green Brown', name_es: 'Pardo verdoso' },
  { code: 'RAL 8001', hex: '#955F20', name_en: 'Ochre Brown', name_es: 'Pardo ocre' },
  { code: 'RAL 8002', hex: '#6C3B2A', name_en: 'Signal Brown', name_es: 'Pardo señales' },
  { code: 'RAL 8003', hex: '#734222', name_en: 'Clay Brown', name_es: 'Pardo arcilla' },
  { code: 'RAL 8004', hex: '#8E402A', name_en: 'Copper Brown', name_es: 'Pardo cobre' },
  { code: 'RAL 8007', hex: '#59351F', name_en: 'Fawn Brown', name_es: 'Pardo corzo' },
  { code: 'RAL 8008', hex: '#6F4F28', name_en: 'Olive Brown', name_es: 'Pardo oliva' },
  { code: 'RAL 8011', hex: '#5B3A29', name_en: 'Nut Brown', name_es: 'Pardo nuez' },
  { code: 'RAL 8012', hex: '#592321', name_en: 'Red Brown', name_es: 'Pardo rojo' },
  { code: 'RAL 8014', hex: '#382C1E', name_en: 'Sepia Brown', name_es: 'Sepia' },
  { code: 'RAL 8015', hex: '#633A34', name_en: 'Chestnut Brown', name_es: 'Castaño' },
  { code: 'RAL 8016', hex: '#4C2F27', name_en: 'Mahogany Brown', name_es: 'Caoba' },
  { code: 'RAL 8017', hex: '#45322E', name_en: 'Chocolate Brown', name_es: 'Chocolate' },
  { code: 'RAL 8019', hex: '#403A3A', name_en: 'Grey Brown', name_es: 'Pardo grisáceo' },
  { code: 'RAL 8022', hex: '#212121', name_en: 'Black Brown', name_es: 'Pardo negruzco' },
  { code: 'RAL 8023', hex: '#A65E2E', name_en: 'Orange Brown', name_es: 'Pardo anaranjado' },
  { code: 'RAL 8024', hex: '#79553D', name_en: 'Beige Brown', name_es: 'Pardo beige' },
  { code: 'RAL 8025', hex: '#755C48', name_en: 'Pale Brown', name_es: 'Pardo pálido' },
  { code: 'RAL 8028', hex: '#4E3B31', name_en: 'Terra Brown', name_es: 'Pardo tierra' },
  { code: 'RAL 8029', hex: '#763C28', name_en: 'Pearl Copper', name_es: 'Cobre perlado' },

  // ── Whites & Blacks (9xxx) ──
  { code: 'RAL 9001', hex: '#FDF4E3', name_en: 'Cream', name_es: 'Blanco crema' },
  { code: 'RAL 9002', hex: '#E7EBDA', name_en: 'Grey White', name_es: 'Blanco grisáceo' },
  { code: 'RAL 9003', hex: '#F4F4F4', name_en: 'Signal White', name_es: 'Blanco señales' },
  { code: 'RAL 9004', hex: '#282828', name_en: 'Signal Black', name_es: 'Negro señales' },
  { code: 'RAL 9005', hex: '#0A0A0A', name_en: 'Jet Black', name_es: 'Negro intenso' },
  { code: 'RAL 9006', hex: '#A5A5A5', name_en: 'White Aluminium', name_es: 'Aluminio blanco' },
  { code: 'RAL 9007', hex: '#8F8F8F', name_en: 'Grey Aluminium', name_es: 'Aluminio gris' },
  { code: 'RAL 9010', hex: '#FFFFFF', name_en: 'Pure White', name_es: 'Blanco puro' },
  { code: 'RAL 9011', hex: '#1C1C1C', name_en: 'Graphite Black', name_es: 'Negro grafito' },
  { code: 'RAL 9012', hex: '#FFFDE6', name_en: 'Clean Room White', name_es: 'Blanco sala limpia' },
  { code: 'RAL 9016', hex: '#F6F6F6', name_en: 'Traffic White', name_es: 'Blanco tráfico' },
  { code: 'RAL 9017', hex: '#1E1E1E', name_en: 'Traffic Black', name_es: 'Negro tráfico' },
  { code: 'RAL 9018', hex: '#D7D7D7', name_en: 'Papyrus White', name_es: 'Blanco papiro' },
  { code: 'RAL 9022', hex: '#9C9C9C', name_en: 'Pearl Light Grey', name_es: 'Gris claro perlado' },
  { code: 'RAL 9023', hex: '#828282', name_en: 'Pearl Dark Grey', name_es: 'Gris oscuro perlado' },
];

/**
 * Search RAL colors by code or name (fuzzy).
 */
export function searchRal(query: string): RalColor[] {
  const q = query.trim().toLowerCase().replace(/\s+/g, '');
  if (!q) return [];

  // Normalize: "ral1003" → "1003", "1003" → "1003", "yellow" → "yellow"
  const numericQ = q.replace(/^ral/, '');

  return RAL_CLASSIC.filter((c) => {
    const codeNorm = c.code.toLowerCase().replace(/\s+/g, '');
    const codeNum = codeNorm.replace('ral', '');
    return (
      codeNum.includes(numericQ) ||
      codeNorm.includes(q) ||
      c.name_en.toLowerCase().includes(q) ||
      c.name_es.toLowerCase().includes(q)
    );
  });
}

/**
 * Convert hex to RGB.
 */
export function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const h = hex.replace('#', '');
  return {
    r: parseInt(h.substring(0, 2), 16),
    g: parseInt(h.substring(2, 4), 16),
    b: parseInt(h.substring(4, 6), 16),
  };
}
