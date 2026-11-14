using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace SmallMart.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddItemImagesAndExclusiveRoles : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "ItemImages",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    ShopId = table.Column<Guid>(type: "uuid", nullable: false),
                    ItemId = table.Column<Guid>(type: "uuid", nullable: true),
                    Path = table.Column<string>(type: "character varying(300)", maxLength: 300, nullable: false),
                    SortOrder = table.Column<int>(type: "integer", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ItemImages", x => x.Id);
                    table.ForeignKey(
                        name: "FK_ItemImages_Items_ItemId",
                        column: x => x.ItemId,
                        principalTable: "Items",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_ItemImages_Shops_ShopId",
                        column: x => x.ShopId,
                        principalTable: "Shops",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_ItemImages_ItemId_SortOrder",
                table: "ItemImages",
                columns: new[] { "ItemId", "SortOrder" });

            migrationBuilder.CreateIndex(
                name: "IX_ItemImages_ShopId_CreatedAt",
                table: "ItemImages",
                columns: new[] { "ShopId", "CreatedAt" });

            // Every existing item keeps its single picture as picture number one.
            migrationBuilder.Sql("""
                INSERT INTO "ItemImages" ("Id", "ShopId", "ItemId", "Path", "SortOrder", "CreatedAt")
                SELECT gen_random_uuid(), "ShopId", "Id", "ImagePath", 0, "UpdatedAt"
                FROM "Items"
                WHERE "ImagePath" IS NOT NULL AND "ImagePath" <> '';
                """);
        }

        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "ItemImages");
        }
    }
}
