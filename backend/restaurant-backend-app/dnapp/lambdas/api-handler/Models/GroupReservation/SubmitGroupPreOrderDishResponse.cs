using System.Text.Json.Serialization;

namespace APIHandler.Models.GroupReservation;

public class SubmitGroupPreOrderDishResponse
{
    [JsonPropertyName("dishId")]
    public string DishId { get; set; } = string.Empty;

    [JsonPropertyName("quantity")]
    public int Quantity { get; set; }
}
