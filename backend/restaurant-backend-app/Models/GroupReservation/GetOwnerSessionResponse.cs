namespace APIHandler.Models.GroupReservation;

public class GetOwnerSessionResponse
{
    public string GuestSessionId { get; set; }

    public GetOwnerSessionResponse(string guestSessionId)
    {
        GuestSessionId = guestSessionId;
    }
}