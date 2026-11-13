using System.Security.Claims;
using Microsoft.AspNetCore.Mvc;

namespace SmallMart.Api.Auth;

public static class ApiExtensions
{
    /// <summary>Id of the signed-in user. Only valid on endpoints that require authorization.</summary>
    public static Guid GetUserId(this ClaimsPrincipal user) => Guid.Parse(user.FindFirst("sub")!.Value);

    /// <summary>An error response with a machine-readable <c>code</c> the app can act on.</summary>
    public static ObjectResult ApiError(this ControllerBase controller, int status, string code, string detail)
    {
        var problem = new ProblemDetails { Status = status, Title = detail, Detail = detail };
        problem.Extensions["code"] = code;
        return controller.StatusCode(status, problem);
    }

    public static ObjectResult ShopDeactivated(this ControllerBase controller) => controller.ApiError(
        StatusCodes.Status403Forbidden, "shop_deactivated",
        "This shop has been deactivated by the platform admin and cannot be changed.");
}
