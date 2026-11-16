using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace SmallMart.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddShopCover : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "CoverPath",
                table: "Shops",
                type: "character varying(300)",
                maxLength: 300,
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "CoverPath",
                table: "Shops");
        }
    }
}
