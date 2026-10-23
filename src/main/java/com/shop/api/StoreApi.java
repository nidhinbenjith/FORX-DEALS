package com.shop.api;

import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;
import java.io.IOException;
import java.net.InetSocketAddress;
import java.nio.file.StandardOpenOption;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.Executors;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/** Small Java 21 API for the Forex Deals storefront. */
public class StoreApi {
  private static final Path PRODUCTS_FILE = Path.of("data", "products.json");
  private static final Path CATALOG_FILE = Path.of("catalog.json");
  private static final Path UPLOADS_DIR = Path.of("uploads");
  private static final int MAX_IMAGE_BYTES = 5 * 1024 * 1024;
  private static final List<Product> PRODUCTS = new ArrayList<>();
  private static final String DB_NAME = System.getenv().getOrDefault("FOREX_DB_NAME", "forex_deals");
  private static final boolean AUTO_CREATE_LOCAL_DATABASE = System.getenv("FOREX_DB_URL") == null;
  private static final String DB_URL = System.getenv().getOrDefault("FOREX_DB_URL",
      "jdbc:mysql://127.0.0.1:3306/" + DB_NAME + "?useSSL=false&allowPublicKeyRetrieval=true&serverTimezone=UTC");
  private static final String DB_USER = System.getenv().getOrDefault("FOREX_DB_USER", "root");
  private static final String DB_PASSWORD = System.getenv().getOrDefault("FOREX_DB_PASSWORD", "");

  record Product(String id, String name, String category, String description, double price, String image, String url) {
    String json() {
      return "{\"id\":" + q(id) + ",\"name\":" + q(name) + ",\"category\":" + q(category) + ",\"description\":" + q(description)
          + ",\"price\":" + price + ",\"image\":" + q(image) + ",\"url\":" + q(url) + "}";
    }
  }

  public static void main(String[] args) throws IOException, SQLException {
    initializeDatabase();

    int port = Integer.parseInt(System.getenv().getOrDefault("JAVA_API_PORT", "8081"));
    HttpServer server = HttpServer.create(new InetSocketAddress("127.0.0.1", port), 0);
    server.createContext("/api/health", x -> respond(x, 200, "{\"status\":\"ok\"}"));
    server.createContext("/api/products", StoreApi::products);
    server.createContext("/api/admin/products", StoreApi::manageProducts);
    server.createContext("/api/admin/images", StoreApi::uploadImage);
    server.setExecutor(Executors.newCachedThreadPool());
    server.start();
    System.out.println("Forex Deals Java API listening on http://127.0.0.1:" + port);
  }

  private static void initializeDatabase() throws SQLException, IOException {
    if (AUTO_CREATE_LOCAL_DATABASE) createLocalDatabaseIfMissing();
    try (Connection connection = databaseConnection();
         Statement statement = connection.createStatement()) {
      statement.executeUpdate("""
          CREATE TABLE IF NOT EXISTS products (
            display_order BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
            id VARCHAR(36) NOT NULL UNIQUE,
            name VARCHAR(100) NOT NULL,
            category VARCHAR(20) NOT NULL,
            description VARCHAR(240) NOT NULL,
            price DECIMAL(12, 2) NOT NULL,
            image TEXT NOT NULL,
            url TEXT NOT NULL
          ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
          """);
      try (ResultSet result = statement.executeQuery("SELECT COUNT(*) FROM products")) {
        if (result.next() && result.getLong(1) == 0 && Files.exists(PRODUCTS_FILE)) {
          List<Product> legacyProducts = parseProducts(Files.readString(PRODUCTS_FILE));
          if (!legacyProducts.isEmpty()) saveProducts(legacyProducts);
        }
      }
    }
    PRODUCTS.addAll(loadProductsFromDatabase());
    writeCatalogExport(PRODUCTS);
  }

  private static void createLocalDatabaseIfMissing() throws SQLException {
    if (!DB_NAME.matches("[A-Za-z0-9_]+")) throw new IllegalArgumentException("FOREX_DB_NAME may contain only letters, numbers, and underscores.");
    String serverUrl = DB_URL.replaceFirst("/[^/?]+(?=\\?|$)", "/");
    try (Connection connection = DriverManager.getConnection(serverUrl, DB_USER, DB_PASSWORD);
         Statement statement = connection.createStatement()) {
      statement.executeUpdate("CREATE DATABASE IF NOT EXISTS " + DB_NAME + " CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci");
    }
  }

  private static Connection databaseConnection() throws SQLException {
    return DriverManager.getConnection(DB_URL, DB_USER, DB_PASSWORD);
  }

  private static List<Product> loadProductsFromDatabase() throws SQLException {
    List<Product> products = new ArrayList<>();
    try (Connection connection = databaseConnection();
         PreparedStatement statement = connection.prepareStatement(
             "SELECT id, name, category, description, price, image, url FROM products ORDER BY display_order DESC");
         ResultSet result = statement.executeQuery()) {
      while (result.next()) {
        products.add(new Product(result.getString("id"), result.getString("name"), result.getString("category"),
            result.getString("description"), result.getDouble("price"), result.getString("image"), result.getString("url")));
      }
    }
    return products;
  }

  private static synchronized void products(HttpExchange x) throws IOException {
    if (!"GET".equals(x.getRequestMethod())) { respond(x, 405, error("Method not allowed.")); return; }
    respond(x, 200, productListJson());
  }

  private static synchronized void manageProducts(HttpExchange x) throws IOException {
    if (!authorized(x)) { respond(x, adminPassword() == null ? 503 : 401, error(adminPassword() == null ? "Admin access is not configured." : "Admin password is incorrect.")); return; }
    if ("GET".equals(x.getRequestMethod())) { respond(x, 200, productListJson()); return; }
    String body = read(x);
    if ("POST".equals(x.getRequestMethod())) {
      String name = field(body, "name");
      String category = field(body, "category");
      String description = field(body, "description");
      String image = field(body, "image");
      String url = field(body, "url");
      double price;
      try { price = Double.parseDouble(number(body, "price")); }
      catch (Exception e) { respond(x, 400, error("Enter a valid price.")); return; }
      if (name.isBlank() || name.length() > 100 || description.length() > 240 || !List.of("digital", "tools", "resources").contains(category) || price <= 0 || price > 100000
          || !imageReference(image) || !webUrl(url)) {
        respond(x, 400, error("Add a name, a price above zero, and valid http or https image and destination links.")); return;
      }
      Product product = new Product(UUID.randomUUID().toString(), name, category, description, price, image, url);
      List<Product> updatedProducts = new ArrayList<>(PRODUCTS);
      updatedProducts.add(0, product);
      try { saveProducts(updatedProducts); }
      catch (SQLException e) { databaseWriteFailed(e, x); return; }
      PRODUCTS.clear();
      PRODUCTS.addAll(updatedProducts);
      try { writeCatalogExport(PRODUCTS); }
      catch (IOException e) { catalogExportFailed(e, x); return; }
      respond(x, 201, product.json());
      return;
    }
    if ("DELETE".equals(x.getRequestMethod())) {
      String id = field(body, "id");
      List<Product> updatedProducts = new ArrayList<>(PRODUCTS);
      boolean removed = updatedProducts.removeIf(product -> product.id().equals(id));
      if (!removed) { respond(x, 404, error("Product not found.")); return; }
      try { saveProducts(updatedProducts); }
      catch (SQLException e) { databaseWriteFailed(e, x); return; }
      PRODUCTS.clear();
      PRODUCTS.addAll(updatedProducts);
      try { writeCatalogExport(PRODUCTS); }
      catch (IOException e) { catalogExportFailed(e, x); return; }
      respond(x, 200, "{\"status\":\"removed\"}");
      return;
    }
    respond(x, 405, error("Method not allowed."));
  }

  private static void databaseWriteFailed(SQLException e, HttpExchange x) throws IOException {
    System.err.println("Could not save products to MySQL: " + e.getMessage());
    respond(x, 500, error("Could not save the product data. Check the database connection and try again."));
  }

  private static void catalogExportFailed(IOException e, HttpExchange x) throws IOException {
    System.err.println("Could not update catalog.json: " + e.getMessage());
    respond(x, 500, error("The product was saved to MySQL, but the Netlify catalog export could not be updated."));
  }

  private static void uploadImage(HttpExchange x) throws IOException {
    if (!authorized(x)) { respond(x, adminPassword() == null ? 503 : 401, error(adminPassword() == null ? "Admin access is not configured." : "Admin password is incorrect.")); return; }
    if (!"POST".equals(x.getRequestMethod())) { respond(x, 405, error("Method not allowed.")); return; }
    String contentType = x.getRequestHeaders().getFirst("Content-Type");
    if (contentType == null) { respond(x, 400, error("Choose a supported image file.")); return; }
    contentType = contentType.split(";", 2)[0].trim().toLowerCase();
    String extension = switch (contentType) {
      case "image/png" -> ".png";
      case "image/jpeg" -> ".jpg";
      case "image/gif" -> ".gif";
      case "image/webp" -> ".webp";
      default -> "";
    };
    if (extension.isEmpty()) { respond(x, 400, error("Upload a PNG, JPG, GIF, or WEBP image.")); return; }
    byte[] bytes = x.getRequestBody().readNBytes(MAX_IMAGE_BYTES + 1);
    if (bytes.length == 0 || bytes.length > MAX_IMAGE_BYTES || !validImageBytes(bytes, contentType)) {
      respond(x, 400, error("The image is empty, invalid, or larger than 5 MB.")); return;
    }
    Files.createDirectories(UPLOADS_DIR);
    String filename = UUID.randomUUID() + extension;
    Files.write(UPLOADS_DIR.resolve(filename), bytes, StandardOpenOption.CREATE_NEW);
    respond(x, 201, "{\"image\":" + q("/uploads/" + filename) + "}");
  }

  private static boolean authorized(HttpExchange x) {
    String password = adminPassword();
    String header = x.getRequestHeaders().getFirst("Authorization");
    if (password == null || header == null || !header.startsWith("Bearer ")) return false;
    return MessageDigest.isEqual(password.getBytes(StandardCharsets.UTF_8), header.substring(7).getBytes(StandardCharsets.UTF_8));
  }

  private static String adminPassword() {
    String password = System.getenv("FOREX_ADMIN_PASSWORD");
    return password == null || password.isBlank() ? null : password;
  }

  private static boolean validImageBytes(byte[] bytes, String contentType) {
    return switch (contentType) {
      case "image/png" -> bytes.length >= 8 && bytes[0] == (byte) 0x89 && bytes[1] == 'P' && bytes[2] == 'N' && bytes[3] == 'G'
          && bytes[4] == 13 && bytes[5] == 10 && bytes[6] == 26 && bytes[7] == 10;
      case "image/jpeg" -> bytes.length >= 3 && bytes[0] == (byte) 0xff && bytes[1] == (byte) 0xd8 && bytes[2] == (byte) 0xff;
      case "image/gif" -> bytes.length >= 6 && bytes[0] == 'G' && bytes[1] == 'I' && bytes[2] == 'F'
          && bytes[3] == '8' && (bytes[4] == '7' || bytes[4] == '9') && bytes[5] == 'a';
      case "image/webp" -> bytes.length >= 12 && bytes[0] == 'R' && bytes[1] == 'I' && bytes[2] == 'F' && bytes[3] == 'F'
          && bytes[8] == 'W' && bytes[9] == 'E' && bytes[10] == 'B' && bytes[11] == 'P';
      default -> false;
    };
  }

  private static synchronized String productListJson() {
    return productListJson(PRODUCTS);
  }

  private static String productListJson(List<Product> products) {
    return products.stream().map(Product::json).collect(java.util.stream.Collectors.joining(",", "[", "]"));
  }

  private static void writeCatalogExport(List<Product> products) throws IOException {
    Files.writeString(CATALOG_FILE, productListJson(products), StandardCharsets.UTF_8);
  }

  private static void saveProducts(List<Product> products) throws SQLException {
    try (Connection connection = databaseConnection()) {
      connection.setAutoCommit(false);
      try (Statement delete = connection.createStatement()) {
        delete.executeUpdate("DELETE FROM products");
      }
      try (PreparedStatement insert = connection.prepareStatement(
          "INSERT INTO products (id, name, category, description, price, image, url) VALUES (?, ?, ?, ?, ?, ?, ?)")) {
        for (int index = products.size() - 1; index >= 0; index--) {
          Product product = products.get(index);
          insert.setString(1, product.id());
          insert.setString(2, product.name());
          insert.setString(3, product.category());
          insert.setString(4, product.description());
          insert.setDouble(5, product.price());
          insert.setString(6, product.image());
          insert.setString(7, product.url());
          insert.addBatch();
        }
        insert.executeBatch();
      }
      connection.commit();
    }
  }

  private static List<Product> parseProducts(String json) {
    List<Product> result = new ArrayList<>();
    Matcher objects = Pattern.compile("\\{[^{}]*}").matcher(json);
    while (objects.find()) {
      String item = objects.group();
      try {
        String id = field(item, "id"), name = field(item, "name");
        double price = Double.parseDouble(number(item, "price"));
        String image = field(item, "image"), url = field(item, "url");
        if (!id.isBlank() && !name.isBlank() && price > 0 && imageReference(image) && webUrl(url)) {
          String category = field(item, "category");
          if (!List.of("digital", "tools", "resources").contains(category)) category = "digital";
          result.add(new Product(id, name, category, field(item, "description"), price, image, url));
        }
      } catch (Exception ignored) { }
    }
    return result;
  }

  private static String number(String json, String key) {
    Matcher m = Pattern.compile("\\\"" + Pattern.quote(key) + "\\\"\\s*:\\s*([0-9]+(?:\\.[0-9]+)?)").matcher(json);
    return m.find() ? m.group(1) : "";
  }

  private static String field(String json, String key) {
    Matcher m = Pattern.compile("\\\"" + Pattern.quote(key) + "\\\"\\s*:\\s*\\\"((?:\\\\.|[^\\\"\\\\])*)\\\"").matcher(json);
    if (!m.find()) return "";
    return m.group(1).replace("\\\\\"", "\"").replace("\\\\n", " ").replace("\\\\r", " ").replace("\\\\\\\\", "\\").trim();
  }

  private static boolean webUrl(String value) {
    try {
      var uri = java.net.URI.create(value);
      return ("https".equalsIgnoreCase(uri.getScheme()) || "http".equalsIgnoreCase(uri.getScheme())) && uri.getHost() != null;
    } catch (Exception e) { return false; }
  }

  private static boolean imageReference(String value) {
    return webUrl(value) || value.matches("/uploads/[A-Za-z0-9_-]+\\.(png|jpg|gif|webp)");
  }

  private static String read(HttpExchange x) throws IOException { return new String(x.getRequestBody().readAllBytes(), StandardCharsets.UTF_8); }
  private static String q(String value) {
    return "\"" + value.replace("\\", "\\\\").replace("\"", "\\\"").replace("\n", " ").replace("\r", " ") + "\"";
  }
  private static String error(String message) { return "{\"message\":" + q(message) + "}"; }
  private static void respond(HttpExchange x, int status, String body) throws IOException {
    byte[] bytes = body.getBytes(StandardCharsets.UTF_8);
    x.getResponseHeaders().set("Content-Type", "application/json; charset=utf-8");
    x.getResponseHeaders().set("Cache-Control", "no-store");
    x.sendResponseHeaders(status, bytes.length);
    try (var output = x.getResponseBody()) { output.write(bytes); }
  }
}
