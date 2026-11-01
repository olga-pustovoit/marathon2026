using Amazon.Lambda.APIGatewayEvents;
using Amazon.Lambda.Core;
using APIHandler.Exceptions;
using APIHandler.Helpers;
using APIHandler.Models.GroupReservation;
using APIHandler.Services.GroupReservations;
using System;
using System.Text.Json;
using System.Threading.Tasks;
using System.Linq;

namespace APIHandler.Handlers.GroupReservations;

public class SubmitGroupPreOrderHandler(
    IGroupReservationService groupReservationService) : IApiRequestHandler
{
    public async Task<APIGatewayProxyResponse> HandleRequest(
        APIGatewayProxyRequest request,
        ILambdaContext context)
    {
        try
        {
            if (request == null)
            {
                return ResponseBuilder.CreateErrorResponse(
                    400, "Request is required.", context.Logger);
            }

            if (request.PathParameters == null ||
                !request.PathParameters.TryGetValue(
                    "groupReservationId", out var groupReservationId) ||
                string.IsNullOrWhiteSpace(groupReservationId))
            {
                return ResponseBuilder.CreateErrorResponse(
                    400, "Group reservation ID is required.", context.Logger);
            }

            var userId = UserContextHelper.GetAuthenticatedUserId(request);

            if (string.IsNullOrWhiteSpace(userId))
            {
                return ResponseBuilder.CreateErrorResponse(
                    401, "Unauthorized.", context.Logger);
            }

            if (string.IsNullOrWhiteSpace(request.Body))
            {
                return ResponseBuilder.CreateErrorResponse(
                    400, "Request body is required.", context.Logger);
            }

            var submitRequest =
                JsonSerializer.Deserialize<SubmitGroupPreOrderRequest>(
                    request.Body,
                    new JsonSerializerOptions
                    {
                        PropertyNameCaseInsensitive = true
                    });

            if (submitRequest == null ||
                string.IsNullOrWhiteSpace(submitRequest.ReservationId))
            {
                return ResponseBuilder.CreateErrorResponse(
                    400, "Reservation ID is required.", context.Logger);
            }

            var dishes = await groupReservationService.SubmitGroupPreOrderAsync(
                userId,
                groupReservationId,
                submitRequest.ReservationId);

            var response = dishes.Select(dish =>
                new SubmitGroupPreOrderDishResponse
                {
                    DishId = dish.DishId,
                    Quantity = dish.Quantity
                }).ToList();

            return ResponseBuilder.CreateSuccessResponse(response);
        }
        catch (GroupReservationNotFoundException ex)
        {
            return ResponseBuilder.CreateErrorResponse(
                404, ex.Message, context.Logger, ex);
        }
        catch (ReservationNotFoundException ex)
        {
            return ResponseBuilder.CreateErrorResponse(
                404, ex.Message, context.Logger, ex);
        }
        catch (ActionForbiddenException ex)
        {
            return ResponseBuilder.CreateErrorResponse(
                403, ex.Message, context.Logger, ex);
        }
        catch (ValidationException ex)
        {
            return ResponseBuilder.CreateErrorResponse(
                400, ex.Message, context.Logger, ex);
        }
        catch (JsonException ex)
        {
            return ResponseBuilder.CreateErrorResponse(
                400, "Invalid JSON request body.", context.Logger, ex);
        }
    }
}