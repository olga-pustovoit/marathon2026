using APIHandler.Constants;
using APIHandler.Entities;
using APIHandler.Exceptions;
using APIHandler.Models.GroupReservation;
using APIHandler.Models.GuestReservation;
using APIHandler.Repositories.GroupReservations;
using APIHandler.Repositories.GuestSessions;
using APIHandler.Repositories.Reservations;
using APIHandler.Repositories.Tables;
using APIHandler.Services.Auth;
using APIHandler.Services.Locations;
using APIHandler.Services.Orders;
using APIHandler.Constants.Orders;
using System;
using System.Linq;
using System.Collections.Generic;
using System.Threading.Tasks;

namespace APIHandler.Services.GroupReservations;

public class GroupReservationService(
    IGroupReservationRepository groupReservationRepository,
    ITableRepository tableRepository,
    IReservationRepository reservationRepository,
    IGuestSessionRepository guestSessionRepository,
    IUserService userService,
    ILocationService locationService,
    IOrderService orderService) : IGroupReservationService
{
    private const string DefaultRestaurantName = "Green & Tasty";

    public async Task<GetGroupReservationResponse> GetGroupReservationByTokenAsync(string token)
    {
        GroupReservation groupReservation = await groupReservationRepository.GetGroupReservationByTokenAsync(token)
            ?? throw new GroupReservationNotFoundException();

        if (groupReservation.Status != GroupReservationStatus.Open)
            throw new GroupReservationExpiredException();

        Task<Reservation?> reservationTask = reservationRepository.GetReservationByIdAsync(groupReservation.ReservationId);
        Task<int> countTask = guestSessionRepository.CountByGroupReservationId(groupReservation.GroupReservationId);

        Reservation reservation = await reservationTask ?? throw new ValidationException("Associated reservation not found.");
        int joinedGuestsCount = await countTask;

        if (joinedGuestsCount >= reservation.GuestCount)
            throw new GuestLimitExceededException();

        Table table = await tableRepository.GetTableAsync(reservation.TableId)
            ?? throw new InvalidOperationException("Associated table not found.");

        Location? location = await locationService.GetLocationByIdAsync(table.LocationId);
        string restaurantName = DefaultRestaurantName;
        string address = location?.Address ?? "Unknown Address";

        string inviterName = "Unknown";
        if (!string.IsNullOrWhiteSpace(reservation.CustomerId))
        {
            inviterName = await userService.GetUserName(reservation.CustomerId) ?? "Unknown";
        }
        return new GetGroupReservationResponse(
            groupReservation.GroupReservationId,
            table.LocationId,
            restaurantName,
            address,
            reservation.StartTime,
            reservation.EndTime,
            reservation.GuestCount,
            table.TableNumber,
            inviterName);
    }

    public async Task<GroupReservation> GetGroupReservationAsync(string groupReservationId)
    {
        GroupReservation? groupReservation = await groupReservationRepository.GetGroupReservationByIdAsync(groupReservationId);
        return groupReservation ?? throw new InvalidOperationException($"Group reservation with ID {groupReservationId} not found.");
    }

    public async Task<GroupReservation> CreateGroupReservationAsync(
        string userId,
        string reservationId)
    {
        var groupReservation = new GroupReservation
        {
            GroupReservationId = Guid.NewGuid().ToString(),
            ReservationId = reservationId,
            ReservationToken = Guid.NewGuid().ToString("N"),
            Status = GroupReservationStatus.Open,
        };

        await groupReservationRepository.SaveGroupReservationAsync(groupReservation);

        await EnsureOwnerSessionAsync(userId, groupReservation.GroupReservationId);

        return groupReservation;
    }

    public async Task CreateGroupReservationIfDoesNotExistAsync(
        string userId,
        string reservationId)
    {
        GroupReservation? group =
            await groupReservationRepository.GetByReservationIdAsync(reservationId);

        if (group is null)
        {
            await CreateGroupReservationAsync(userId, reservationId);
            return;
        }

        await EnsureOwnerSessionAsync(userId, group.GroupReservationId);
    }

    public async Task UpdateGroupReservationStatusAsync(string groupReservationId, GroupReservationStatus status)
    {
        var groupReservation = await GetGroupReservationAsync(groupReservationId);

        groupReservation.Status = status;

        await groupReservationRepository.SaveGroupReservationAsync(groupReservation);
    }

    public async Task DeleteGroupReservationAsync(string groupReservationId)
    {
        var groupReservation = await GetGroupReservationAsync(groupReservationId);

        await groupReservationRepository.DeleteGroupReservationAsync(groupReservation);
    }

    public async Task CloseGroupReservationAsync(string reservationId)
    {
        GroupReservation? groupReservation = await groupReservationRepository.GetByReservationIdAsync(reservationId);
        if (groupReservation is null)
            return;

        groupReservation.Status = GroupReservationStatus.Closed;

        await groupReservationRepository.SaveGroupReservationAsync(groupReservation);
    }

    public async Task<GetGroupInviteTokenResponse> GetGroupReservationInviteTokenAsync(string reservationId)
    {
        var reservation = await reservationRepository.GetReservationByIdAsync(reservationId)
            ?? throw new ReservationNotFoundException($"Reservation {reservationId} was not found.");

        if (reservation.GuestCount < 2)
            throw new ValidationException("Retrieving invitation token for the reservation with only one guest is not permitted.");

        if (reservation.Status != ReservationStatus.Reserved)
            throw new GroupReservationExpiredException("The group reservation is expired.");

        GroupReservation groupReservation = (await groupReservationRepository.GetByReservationIdAsync(reservationId))!;

        if (groupReservation.Status == GroupReservationStatus.Submitted)
            throw new GroupReservationSubmittedException();

        if (groupReservation.Status == GroupReservationStatus.Closed)
            throw new GroupReservationExpiredException();

        return new GetGroupInviteTokenResponse(groupReservation.ReservationToken);
    }

    public async Task<List<OrderItem>> SubmitGroupPreOrderAsync(
        string userId,
        string groupReservationId,
        string reservationId)
    {
        // 1. Find group reservation
        var group = await groupReservationRepository
            .GetGroupReservationByIdAsync(groupReservationId)
            ?? throw new GroupReservationNotFoundException();

        // 2. Validate reservation relationship
        if (group.ReservationId != reservationId)
        {
            throw new ValidationException(
                "Group reservation does not belong to this reservation.");
        }

        // 3. Only an open group can be submitted
        if (group.Status != GroupReservationStatus.Open)
        {
            throw new ValidationException(
                "Group reservation is already submitted or closed.");
        }

        // 4. Find reservation
        var reservation = await reservationRepository
            .GetReservationByIdAsync(reservationId)
            ?? throw new ReservationNotFoundException(
                $"Reservation {reservationId} was not found.");

        // 5. Verify reservation owner
        if (!string.Equals(
            reservation.CustomerId,
            userId,
            StringComparison.OrdinalIgnoreCase))
        {
            throw new ActionForbiddenException(
                "Only the reservation owner can submit the group pre-order.");
        }

        var table = await tableRepository.GetTableAsync(reservation.TableId)
            ?? throw new ValidationException("Associated table not found.");

        var location = await locationService.GetLocationByIdAsync(table.LocationId)
            ?? throw new ValidationException("Location not found for the reservation's table.");

        var reservationTime =
            $"{reservation.StartTime:MMM dd, yyyy, h:mm tt} - {reservation.EndTime:h:mm tt}";

        // 6. Verify owner session
        var sessions = await guestSessionRepository
            .GetAllByGroupReservationIdAsync(groupReservationId);

        var ownerSession = sessions.FirstOrDefault(s => s.IsOwnerSession);

        if (ownerSession == null || ownerSession.OwnerUserId != userId)
        {
            throw new ActionForbiddenException(
                "You are not authorized to submit this group pre-order.");
        }

        // 7. Take only submitted guest sessions
        var submittedSessions = sessions
            .Where(s => s.IsSubmitted && !s.IsOwnerSession)
            .ToList();

        if (submittedSessions.Count == 0)
        {
            throw new ValidationException(
                "There are no submitted guest sessions.");
        }

        // 8. Collect dishes
        var allDishes = submittedSessions
            .SelectMany(s => s.Dishes ?? [])
            .ToList();

        if (allDishes.Count == 0)
        {
            throw new ValidationException(
                "Submitted guest sessions contain no dishes.");
        }

        // 9. Combine identical dishes
        var combinedDishes = allDishes
            .GroupBy(d => d.DishId)
            .Select(g => new OrderItem
            {
                DishId = g.Key,
                Quantity = g.Sum(d => d.Quantity),
                State = OrderItemState.Pending
            })
            .ToList();

        if (combinedDishes.Any(d => d.Quantity <= 0))
        {
            throw new ValidationException(
                "Invalid dish quantity in submitted guest sessions.");
        }

        // 10. Create or update group order
        await orderService.SubmitGroupPreOrderAsync(
            userId,
            reservationId,
            combinedDishes,
            location.Address,
            reservationTime);

        // 11. Mark group as submitted
        group.Status = GroupReservationStatus.Submitted;
        await groupReservationRepository.SaveGroupReservationAsync(group);

        return combinedDishes;
    }

    private async Task EnsureOwnerSessionAsync(
        string userId,
        string groupReservationId)
    {
        var sessions =
            await guestSessionRepository.GetAllByGroupReservationIdAsync(groupReservationId);

        if (sessions.Any(s => s.IsOwnerSession))
            return;

        var ownerSession = new GuestSession
        {
            Id = Guid.NewGuid().ToString(),
            GroupReservationId = groupReservationId,
            GuestName = "Owner",
            Dishes = [],
            IsOwnerSession = true,
            OwnerUserId = userId
        };

        await guestSessionRepository.SaveAsync(ownerSession);
    }

    public async Task<string?> GetOwnerSessionIdAsync(
        string userId,
        string reservationId)
    {
        var groupReservation =
            await groupReservationRepository.GetByReservationIdAsync(reservationId)
            ?? throw new GroupReservationNotFoundException();

        var reservation =
            await reservationRepository.GetReservationByIdAsync(reservationId)
            ?? throw new ReservationNotFoundException(
                $"Reservation {reservationId} was not found.");

        if (reservation.CustomerId != userId)
        {
            throw new ActionForbiddenException(
                "Only the reservation owner can access the owner session.");
        }

        var sessions =
            await guestSessionRepository.GetAllByGroupReservationIdAsync(
                groupReservation.GroupReservationId);

        var ownerSession = sessions.FirstOrDefault(s => s.IsOwnerSession);

        if (ownerSession == null)
        {
            return null;
        }

        if (ownerSession.OwnerUserId != userId)
        {
            throw new ActionForbiddenException(
                "You are not authorized to access this owner session.");
        }

        return ownerSession.Id;
    }

}


