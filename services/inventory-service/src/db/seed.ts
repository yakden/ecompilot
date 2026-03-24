// ─────────────────────────────────────────────────────────────────────────────
// EcomPilot PL — inventory-service
// Sample data seed: 20 products with realistic sales history
// Run: DATABASE_URL=... tsx src/db/seed.ts
// ─────────────────────────────────────────────────────────────────────────────

import { Pool } from "pg";

const DATABASE_URL =
  process.env["DATABASE_URL"] ??
  "postgresql://ecompilot:ecompilot_secret@localhost:5432/ecompilot";

// Demo user ID — matches the mock user in the frontend auth store
const DEMO_USER_ID = "00000000-0000-0000-0000-000000000001";

interface ProductSeed {
  sku: string;
  name: string;
  category: string;
  purchasePrice: number; // grosze
  sellingPrice: number; // grosze
  currentStock: number;
  reservedStock: number;
  reorderPoint: number;
  leadTimeDays: number;
  totalSold: number;
  totalRevenue: number; // grosze
  daysSinceLastSale: number | null; // null = never sold
  daysOfHistory: number; // how many daily snapshot rows to generate
}

// Products spanning electronics, fashion, and home goods.
// Some deliberately have dead/slow stock (daysSinceLastSale >= 30).
const PRODUCTS: ProductSeed[] = [
  // ── Electronics (high-revenue A/B class) ────────────────────────────────
  {
    sku: "ELEC-001",
    name: "Słuchawki bezprzewodowe BT Pro",
    category: "Electronics",
    purchasePrice: 8900,
    sellingPrice: 19900,
    currentStock: 45,
    reservedStock: 3,
    reorderPoint: 15,
    leadTimeDays: 25,
    totalSold: 312,
    totalRevenue: 6208800,
    daysSinceLastSale: 0,
    daysOfHistory: 90,
  },
  {
    sku: "ELEC-002",
    name: "Kabel USB-C do USB-C 2m",
    category: "Electronics",
    purchasePrice: 450,
    sellingPrice: 1290,
    currentStock: 230,
    reservedStock: 12,
    reorderPoint: 50,
    leadTimeDays: 20,
    totalSold: 1840,
    totalRevenue: 2373600,
    daysSinceLastSale: 0,
    daysOfHistory: 90,
  },
  {
    sku: "ELEC-003",
    name: "Ładowarka GaN 65W",
    category: "Electronics",
    purchasePrice: 3200,
    sellingPrice: 7990,
    currentStock: 8,
    reservedStock: 2,
    reorderPoint: 20,
    leadTimeDays: 28,
    totalSold: 245,
    totalRevenue: 1957550,
    daysSinceLastSale: 1,
    daysOfHistory: 90,
  },
  {
    sku: "ELEC-004",
    name: "Kamera sportowa 4K Action",
    category: "Electronics",
    purchasePrice: 28000,
    sellingPrice: 59900,
    currentStock: 14,
    reservedStock: 1,
    reorderPoint: 5,
    leadTimeDays: 35,
    totalSold: 78,
    totalRevenue: 4672200,
    daysSinceLastSale: 2,
    daysOfHistory: 90,
  },
  {
    sku: "ELEC-005",
    name: "Inteligentna żarówka LED RGB",
    category: "Electronics",
    purchasePrice: 890,
    sellingPrice: 2490,
    currentStock: 3,
    reservedStock: 0,
    reorderPoint: 25,
    leadTimeDays: 21,
    totalSold: 520,
    totalRevenue: 1294800,
    daysSinceLastSale: 0,
    daysOfHistory: 90,
  },
  {
    sku: "ELEC-006",
    name: "Głośnik Bluetooth mini wodoodporny",
    category: "Electronics",
    purchasePrice: 4500,
    sellingPrice: 9990,
    currentStock: 0,
    reservedStock: 0,
    reorderPoint: 10,
    leadTimeDays: 30,
    totalSold: 89,
    totalRevenue: 889110,
    daysSinceLastSale: 4,
    daysOfHistory: 90,
  },
  // ── Fashion ──────────────────────────────────────────────────────────────
  {
    sku: "FASH-001",
    name: "Koszulka basic oversize unisex",
    category: "Fashion",
    purchasePrice: 2200,
    sellingPrice: 5990,
    currentStock: 87,
    reservedStock: 5,
    reorderPoint: 20,
    leadTimeDays: 14,
    totalSold: 643,
    totalRevenue: 3851570,
    daysSinceLastSale: 0,
    daysOfHistory: 90,
  },
  {
    sku: "FASH-002",
    name: "Skarpety sportowe (3-pak)",
    category: "Fashion",
    purchasePrice: 800,
    sellingPrice: 2490,
    currentStock: 155,
    reservedStock: 8,
    reorderPoint: 30,
    leadTimeDays: 14,
    totalSold: 1120,
    totalRevenue: 2788800,
    daysSinceLastSale: 0,
    daysOfHistory: 90,
  },
  {
    sku: "FASH-003",
    name: "Czapka zimowa wełniana z pomponem",
    category: "Fashion",
    purchasePrice: 1200,
    sellingPrice: 3490,
    currentStock: 92,
    reservedStock: 0,
    reorderPoint: 15,
    leadTimeDays: 14,
    totalSold: 34,
    totalRevenue: 118660,
    daysSinceLastSale: 65, // dead stock — winter item in off-season
    daysOfHistory: 90,
  },
  {
    sku: "FASH-004",
    name: "Pas do biegania neoprenowy",
    category: "Fashion",
    purchasePrice: 1500,
    sellingPrice: 3990,
    currentStock: 28,
    reservedStock: 0,
    reorderPoint: 10,
    leadTimeDays: 18,
    totalSold: 15,
    totalRevenue: 59850,
    daysSinceLastSale: 42, // slow moving
    daysOfHistory: 60,
  },
  {
    sku: "FASH-005",
    name: "Okulary przeciwsłoneczne polaryzacyjne",
    category: "Fashion",
    purchasePrice: 1800,
    sellingPrice: 4990,
    currentStock: 19,
    reservedStock: 1,
    reorderPoint: 8,
    leadTimeDays: 21,
    totalSold: 178,
    totalRevenue: 888220,
    daysSinceLastSale: 3,
    daysOfHistory: 90,
  },
  // ── Home Goods ────────────────────────────────────────────────────────────
  {
    sku: "HOME-001",
    name: "Organizator na biurko bambusowy",
    category: "Home & Garden",
    purchasePrice: 2800,
    sellingPrice: 6990,
    currentStock: 41,
    reservedStock: 2,
    reorderPoint: 12,
    leadTimeDays: 28,
    totalSold: 256,
    totalRevenue: 1789440,
    daysSinceLastSale: 1,
    daysOfHistory: 90,
  },
  {
    sku: "HOME-002",
    name: "Świeca sojowa zapachowa 200ml",
    category: "Home & Garden",
    purchasePrice: 1200,
    sellingPrice: 3290,
    currentStock: 67,
    reservedStock: 4,
    reorderPoint: 20,
    leadTimeDays: 10,
    totalSold: 432,
    totalRevenue: 1421280,
    daysSinceLastSale: 0,
    daysOfHistory: 90,
  },
  {
    sku: "HOME-003",
    name: "Ramka na zdjęcia drewniana 13x18",
    category: "Home & Garden",
    purchasePrice: 900,
    sellingPrice: 2490,
    currentStock: 112,
    reservedStock: 0,
    reorderPoint: 15,
    leadTimeDays: 14,
    totalSold: 8,
    totalRevenue: 19920,
    daysSinceLastSale: 78, // dead stock
    daysOfHistory: 90,
  },
  {
    sku: "HOME-004",
    name: "Mata do jogi antypoślizgowa 6mm",
    category: "Home & Garden",
    purchasePrice: 3500,
    sellingPrice: 8990,
    currentStock: 22,
    reservedStock: 2,
    reorderPoint: 8,
    leadTimeDays: 21,
    totalSold: 134,
    totalRevenue: 1204660,
    daysSinceLastSale: 2,
    daysOfHistory: 90,
  },
  {
    sku: "HOME-005",
    name: "Filtr do wody dzbanek 3.5L",
    category: "Home & Garden",
    purchasePrice: 4200,
    sellingPrice: 9490,
    currentStock: 6,
    reservedStock: 1,
    reorderPoint: 10,
    leadTimeDays: 18,
    totalSold: 210,
    totalRevenue: 1992900,
    daysSinceLastSale: 0,
    daysOfHistory: 90,
  },
  {
    sku: "HOME-006",
    name: "Doniczka ceramiczna biała 15cm",
    category: "Home & Garden",
    purchasePrice: 700,
    sellingPrice: 1990,
    currentStock: 84,
    reservedStock: 0,
    reorderPoint: 10,
    leadTimeDays: 12,
    totalSold: 7,
    totalRevenue: 13930,
    daysSinceLastSale: 55, // dead stock
    daysOfHistory: 90,
  },
  // ── Mixed additional ────────────────────────────────────────────────────
  {
    sku: "SPRT-001",
    name: "Skakanka treningowa stalowa",
    category: "Sports",
    purchasePrice: 1400,
    sellingPrice: 3490,
    currentStock: 33,
    reservedStock: 3,
    reorderPoint: 10,
    leadTimeDays: 18,
    totalSold: 287,
    totalRevenue: 1001730,
    daysSinceLastSale: 1,
    daysOfHistory: 90,
  },
  {
    sku: "SPRT-002",
    name: "Rękawice do siłowni skórzane XL",
    category: "Sports",
    purchasePrice: 2300,
    sellingPrice: 5490,
    currentStock: 11,
    reservedStock: 0,
    reorderPoint: 5,
    leadTimeDays: 21,
    totalSold: 45,
    totalRevenue: 247050,
    daysSinceLastSale: 38, // slow moving
    daysOfHistory: 60,
  },
  {
    sku: "BEAU-001",
    name: "Serum witaminowe C 30ml",
    category: "Beauty",
    purchasePrice: 3800,
    sellingPrice: 8990,
    currentStock: 29,
    reservedStock: 3,
    reorderPoint: 12,
    leadTimeDays: 21,
    totalSold: 198,
    totalRevenue: 1780020,
    daysSinceLastSale: 0,
    daysOfHistory: 90,
  },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function dateMinus(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString();
}

function dateStrMinus(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().split("T")[0] ?? d.toISOString().substring(0, 10);
}

// ─── Main seed ────────────────────────────────────────────────────────────────

async function seed(): Promise<void> {
  const pool = new Pool({ connectionString: DATABASE_URL });
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    // Wipe existing demo data so seed is idempotent
    await client.query(
      "DELETE FROM inv_products WHERE user_id = $1",
      [DEMO_USER_ID],
    );

    for (const p of PRODUCTS) {
      const lastSoldAt =
        p.daysSinceLastSale !== null
          ? dateMinus(p.daysSinceLastSale)
          : null;

      // Insert product
      const { rows } = await client.query<{ id: string }>(
        `INSERT INTO inv_products (
           user_id, sku, name, category,
           purchase_price, selling_price,
           current_stock, reserved_stock,
           reorder_point, lead_time_days,
           last_sold_at, total_sold, total_revenue,
           created_at, updated_at
         ) VALUES (
           $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
           $11, $12, $13, NOW() - INTERVAL '120 days', NOW()
         )
         RETURNING id`,
        [
          DEMO_USER_ID,
          p.sku,
          p.name,
          p.category,
          p.purchasePrice,
          p.sellingPrice,
          p.currentStock,
          p.reservedStock,
          p.reorderPoint,
          p.leadTimeDays,
          lastSoldAt,
          p.totalSold,
          p.totalRevenue,
        ],
      );

      const productId = rows[0]?.id;
      if (productId === undefined) {
        throw new Error(`Failed to insert product ${p.sku}`);
      }

      // Generate daily snapshots
      const avgDailySold = p.daysOfHistory > 0
        ? Math.round(p.totalSold / p.daysOfHistory)
        : 0;

      for (let day = p.daysOfHistory - 1; day >= 0; day--) {
        const dateStr = dateStrMinus(day);

        // Dead/slow stock products have no recent sales
        let soldToday = 0;
        if (p.daysSinceLastSale === null || day < p.daysSinceLastSale) {
          // No sales before last sale date (or never sold)
          soldToday = 0;
        } else {
          // Add some variance: ±50% of average
          const variance = Math.floor((Math.random() - 0.5) * avgDailySold);
          soldToday = Math.max(0, avgDailySold + variance);
        }

        const revenueToday = soldToday * p.sellingPrice;
        // Approximate stock at that time
        const stockAtDay = Math.min(
          p.currentStock + soldToday * (p.daysOfHistory - day),
          p.currentStock + 200,
        );

        await client.query(
          `INSERT INTO inv_snapshots
             (product_id, stock, date, sold_count, revenue)
           VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT (product_id, date) DO UPDATE SET
             stock = EXCLUDED.stock,
             sold_count = EXCLUDED.sold_count,
             revenue = EXCLUDED.revenue`,
          [productId, stockAtDay, dateStr, soldToday, revenueToday],
        );
      }

      // Generate reorder alerts for products below reorder point
      if (p.currentStock <= p.reorderPoint) {
        const alertType = p.currentStock === 0 ? "out_of_stock" : "low_stock";
        await client.query(
          `INSERT INTO inv_reorder_alerts
             (product_id, alert_type, current_stock, reorder_point)
           VALUES ($1, $2, $3, $4)`,
          [productId, alertType, p.currentStock, p.reorderPoint],
        );
      }

      // Generate dead_stock alerts for long-dormant products
      if (
        p.daysSinceLastSale !== null &&
        p.daysSinceLastSale >= 60
      ) {
        await client.query(
          `INSERT INTO inv_reorder_alerts
             (product_id, alert_type, current_stock, reorder_point)
           VALUES ($1, 'dead_stock', $2, $3)`,
          [productId, p.currentStock, p.reorderPoint],
        );
      }
    }

    await client.query("COMMIT");
    process.stdout.write(
      `Seeded ${PRODUCTS.length} products for user ${DEMO_USER_ID}\n`,
    );
  } catch (err) {
    await client.query("ROLLBACK");
    process.stderr.write(`Seed failed: ${String(err)}\n`);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

seed().catch((err: unknown) => {
  process.stderr.write(`Unexpected error: ${String(err)}\n`);
  process.exit(1);
});
