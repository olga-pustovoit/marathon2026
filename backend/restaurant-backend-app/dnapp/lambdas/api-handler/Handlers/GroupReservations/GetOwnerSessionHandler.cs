using System.Threading.Tasks;

using Amazon.Lambda.APIGatewayEvents;
using Amazon.Lambda.Core;
using APIHandler.Exceptions;
using APIHandler.Helpers;
using APIHandler.Models.GroupReservation;
using APIHandler.Services.GroupReservations;

namespace APIHandler.Handlers.GroupReservations;

public class GetOwnerSessionHandler(
    IGroupReservationService service) : IApiRequestHandler
{
    public async Task<APIGatewayProxyResponse> HandleRequest(
        APIGatewayProxyRequest request,
        ILambdaContext context)
    {
        var userId = UserContextHelper.GetAuthenticatedUserId(request);

        if (string.IsNullOrEmpty(userId))
        {
            return ResponseBuilder.CreateErrorResponse(
                401,
                "Unauthorized: User ID is missing.",
                context.Logger);
        }

        if (!request.TryGetPathValue("reservationId", out string? reservationId)
            || string.IsNullOrEmpty(reservationId))
        {
            return ResponseBuilder.CreateErrorResponse(
                400,
                "Reservation ID is required.",
                context.Logger);
        }

        try
        {
            var guestSessionId = await service.GetOwnerSessionIdAsync(
                userId,
                reservationId);

            if (guestSessionId == null)
            {
                return ResponseBuilder.CreateErrorResponse(
                    404,
                    "Owner session was not found.",
                    context.Logger);
            }

            return ResponseBuilder.CreateJsonResponse(
                200,
                new GetOwnerSessionResponse(guestSessionId));
        }
        catch (GroupReservationNotFoundException ex)
        {
            return ResponseBuilder.CreateErrorResponse(404, ex.Message, context.Logger);
        }
        catch (ReservationNotFoundException ex)
        {
            return ResponseBuilder.CreateErrorResponse(404, ex.Message, context.Logger);
        }
        catch (ActionForbiddenException ex)
        {
            return ResponseBuilder.CreateErrorResponse(403, ex.Message, context.Logger);
        }
        catch (APIHandler.Exceptions.ValidationException ex)
        {
            return ResponseBuilder.CreateErrorCodeResponse(ex);
        }
    }
}
