using Amazon.Lambda.APIGatewayEvents;
using Amazon.Lambda.Core;
using APIHandler.Exceptions;
using APIHandler.Helpers;
using APIHandler.Services.GroupReservations;
using System.Threading.Tasks;

namespace APIHandler.Handlers.GuestSessions;

public class RemoveGroupParticipantDishHandler(
    IGroupReservationService groupReservationService) : IApiRequestHandler
{
    public async Task<APIGatewayProxyResponse> HandleRequest(
        APIGatewayProxyRequest request,
        ILambdaContext context)
    {
        if (!request.TryGetPathValue("groupReservationId", out string? groupReservationId) ||
            !request.TryGetPathValue("guestSessionId", out string? guestSessionId) ||
            !request.TryGetPathValue("dishId", out string? dishId))
        {
            return ResponseBuilder.CreateErrorResponse(
                400,
                "Group reservation, guest session, and dish IDs are required.",
                context.Logger);
        }

        var userId = UserContextHelper.GetAuthenticatedUserId(request);
        if (string.IsNullOrWhiteSpace(userId))
        {
            return ResponseBuilder.CreateErrorResponse(
                401,
                "Unauthorized.",
                context.Logger);
        }

        try
        {
            await groupReservationService.RemoveParticipantDishAsync(
                userId,
                groupReservationId,
                guestSessionId,
                dishId);

            return ResponseBuilder.CreateSuccessResponse(
                new { message = "Dish removed from participant order." });
        }
        catch (GroupReservationNotFoundException ex)
        {
            return ResponseBuilder.CreateErrorResponse(404, ex.Message, context.Logger, ex);
        }
        catch (ReservationNotFoundException ex)
        {
            return ResponseBuilder.CreateErrorResponse(404, ex.Message, context.Logger, ex);
        }
        catch (GuestSessionNotFoundException ex)
        {
            return ResponseBuilder.CreateErrorResponse(404, ex.Message, context.Logger, ex);
        }
        catch (DishNotFoundException ex)
        {
            return ResponseBuilder.CreateErrorResponse(404, ex.Message, context.Logger, ex);
        }
        catch (ActionForbiddenException ex)
        {
            return ResponseBuilder.CreateErrorResponse(403, ex.Message, context.Logger, ex);
        }
        catch (ValidationException ex)
        {
            return ResponseBuilder.CreateErrorResponse(400, ex.Message, context.Logger, ex);
        }
    }
}
